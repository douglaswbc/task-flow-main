import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const payload = await req.json();
        const instanceName = payload.instance;
        const data = payload.data;

        console.log(`[Webhook]: Evento recebido: ${payload.event} da instância ${instanceName}`);

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // 1. Handle Status Updates
        if (["connection.update", "instance.update"].includes(payload.event)) {
            const state = data?.state || data?.status || (payload.event === "instance.update" ? data?.instance?.status : null);
            if (state) {
                await supabase
                    .from("whatsapp_instances")
                    .update({ connection_status: state.toLowerCase() })
                    .eq("instance_name", instanceName);

                console.log(`[Status]: Instância ${instanceName} atualizada para ${state}`);
            }
            return new Response("Status atualizado", { headers: corsHeaders });
        }

        // 2. Processar apenas mensagens
        if (payload.event !== "messages.upsert" || !data) {
            return new Response("Evento ignorado", { headers: corsHeaders });
        }

        const message = data.message;
        const messageId = data.key?.id;
        const isFromMe = data.key?.fromMe === true;
        const remoteJid = data.key?.remoteJid || "";
        const pushName = data.pushName || remoteJid.split("@")[0];
        const isGroup = remoteJid.includes("@g.us");

        // Ignorar mensagens enviadas por mim
        if (isFromMe) {
            return new Response("Mensagem própria ignorada", { headers: corsHeaders });
        }

        console.log(`[Message]: ${isGroup ? 'Grupo' : 'Individual'} de ${pushName} (${remoteJid})`);

        // 3. Buscar instância
        const { data: instance, error: instanceError } = await supabase
            .from("whatsapp_instances")
            .select("id, profile_id, instance_name, token")
            .eq("instance_name", instanceName)
            .single();

        if (instanceError || !instance) {
            console.error(`[Error]: Instância ${instanceName} não encontrada`);
            return new Response("Instância não encontrada", { status: 404, headers: corsHeaders });
        }

        // 4. Extrair mensagem de texto (se houver)
        let textMessage = "";
        if (message?.conversation) {
            textMessage = message.conversation;
        } else if (message?.extendedTextMessage?.text) {
            textMessage = message.extendedTextMessage.text;
        }

        // 5. Processar PDFs (GRUPOS ou INDIVIDUAIS)
        if (message?.documentMessage && message.documentMessage.mimetype === "application/pdf") {
            const fileName = message.documentMessage.fileName || `catalogo_${Date.now()}.pdf`;

            let whatsappGroupId = null;
            const sourceType = isGroup ? 'group' : 'individual';

            // Se for grupo, verificar se está cadastrado
            if (isGroup) {
                const { data: whatsappGroup } = await supabase
                    .from("whatsapp_groups")
                    .select("id, is_active")
                    .eq("whatsapp_id", remoteJid)
                    .eq("user_id", instance.profile_id)
                    .single();

                if (!whatsappGroup || !whatsappGroup.is_active) {
                    console.log(`[Skip]: Grupo ${remoteJid} não cadastrado ou inativo`);
                    return new Response("Grupo não cadastrado", { headers: corsHeaders });
                }

                whatsappGroupId = whatsappGroup.id;
            }

            console.log(`[Catalog]: PDF ${sourceType} detectado: ${fileName}`);
            console.log(`[Catalog]: De: ${pushName} (${remoteJid})`);
            console.log(`[Catalog]: Texto: ${textMessage || '(sem texto)'}`);

            try {
                // Obter o PDF em base64
                const pdfBase64 = await getMediaBase64(instanceName, instance.token, messageId);

                if (!pdfBase64) {
                    throw new Error("Não foi possível obter o PDF");
                }

                // Converter base64 para bytes
                const pdfBytes = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0));

                // Gerar nome único para o arquivo
                const timestamp = Date.now();
                const sanitizedFileName = fileName
                    .replace(/[^a-zA-Z0-9._-]/g, '_')
                    .substring(0, 100);
                const storagePath = `${instance.profile_id}/catalogs/${timestamp}_${sanitizedFileName}`;

                // Upload para Supabase Storage
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('catalogs')
                    .upload(storagePath, pdfBytes, {
                        contentType: 'application/pdf',
                        upsert: false
                    });

                if (uploadError) {
                    throw uploadError;
                }

                console.log(`[Storage]: PDF salvo em: ${storagePath}`);

                // Obter URL pública do arquivo
                const { data: urlData } = supabase.storage
                    .from('catalogs')
                    .getPublicUrl(storagePath);

                // Registrar no banco de dados
                const { error: logError } = await supabase
                    .from("processing_logs")
                    .insert({
                        user_id: instance.profile_id,
                        whatsapp_group_id: whatsappGroupId, // null se individual
                        catalog_name: fileName,
                        category: extractCategory(textMessage),
                        status: "pending",
                        file_url: urlData.publicUrl,
                        text_message: textMessage || null,
                        source_type: sourceType,        // 'individual' ou 'group'
                        contact_name: pushName,          // Nome do contato
                        contact_jid: remoteJid,          // WhatsApp JID
                        processed_at: new Date().toISOString()
                    });

                if (logError) {
                    console.error(`[Error]: Erro ao salvar log:`, logError);
                }

                console.log(`[Success]: Catálogo ${sourceType} processado com sucesso!`);

                return new Response(JSON.stringify({
                    success: true,
                    source_type: sourceType,
                    contact: pushName,
                    file: storagePath,
                    url: urlData.publicUrl
                }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });

            } catch (error) {
                console.error(`[Error]: Erro ao processar PDF:`, error);

                // Registra erro no log
                await supabase.from("processing_logs").insert({
                    user_id: instance.profile_id,
                    whatsapp_group_id: whatsappGroupId,
                    catalog_name: fileName,
                    status: "error",
                    error_message: error.message,
                    text_message: textMessage || null,
                    source_type: sourceType,
                    contact_name: pushName,
                    contact_jid: remoteJid,
                    processed_at: new Date().toISOString()
                });

                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }
        }

        // 6. Mensagens de texto (sem PDF)
        if (textMessage) {
            console.log(`[${isGroup ? 'Group' : 'Individual'} Text]: ${textMessage.substring(0, 50)}...`);
        }

        return new Response(JSON.stringify({
            success: true,
            type: isGroup ? "group_message" : "individual_message"
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("[Error]: Erro no webhook:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});

/* =====================================================
 * FUNÇÕES AUXILIARES
 * ===================================================== */

/**
 * Obtém mídia em base64 da Evolution API
 */
async function getMediaBase64(instance: string, token: string, messageId: string) {
    try {
        const rawUrl = Deno.env.get("EVO_API_URL");

        if (!rawUrl) {
            console.error(`[Media]: EVO_API_URL não está configurada nas variáveis de ambiente`);
            return null;
        }

        const baseUrl = rawUrl.replace(/\/+$/, "");
        const fullUrl = `${baseUrl}/chat/getBase64FromMediaMessage/${instance}`;

        console.log(`[Media]: Solicitando base64 de ${fullUrl}`);
        console.log(`[Media]: MessageID: ${messageId}`);

        const res = await fetch(fullUrl, {
            method: 'POST',
            headers: { 'apikey': token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: {
                    key: {
                        id: messageId
                    }
                },
                convertToMp4: false
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(`[Media]: Erro HTTP ${res.status}:`, errText);
            return null;
        }

        const json = await res.json();

        if (!json.base64) {
            console.warn(`[Media]: Resposta da API não contém base64`);
            console.warn(`[Media]: Resposta:`, JSON.stringify(json).substring(0, 200));
        }

        return json.base64 || null;
    } catch (e) {
        console.error(`[Media]: Erro ao obter base64:`, e);
        return null;
    }
}

/**
 * Tenta extrair categoria da mensagem de texto
 * Exemplos: "x3-35%", "Papelaria x3", etc.
 */
function extractCategory(text: string): string | null {
    if (!text) return null;

    const lowerText = text.toLowerCase();

    // Detecta padrões comuns
    if (lowerText.includes("papelaria")) return "Papelaria";
    if (lowerText.includes("utilidades")) return "Utilidades";
    if (lowerText.includes("brinquedos")) return "Brinquedos";
    if (lowerText.includes("alimentos")) return "Alimentos";

    // Você pode adicionar mais categorias aqui

    return null; // Categoria não identificada
}
