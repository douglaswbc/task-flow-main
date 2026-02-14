import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        // 1. Validar autenticação
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Não autenticado" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_ANON_KEY")!,
            { global: { headers: { Authorization: authHeader } } }
        );

        // Verificar usuário autenticado
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // 2. Obter parâmetros
        const { instance_name } = await req.json();
        if (!instance_name) {
            return new Response(JSON.stringify({ error: "instance_name é obrigatório" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        console.log(`[Import]: Iniciando importação para instância ${instance_name}`);

        // 3. Obter credenciais da Evolution API
        const EVO_URL = Deno.env.get("EVO_API_URL")?.replace(/\/+$/, "");
        const EVO_KEY = Deno.env.get("EVO_API_KEY");

        if (!EVO_URL || !EVO_KEY) {
            return new Response(JSON.stringify({ error: "Configuração da Evolution API não encontrada" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        const evoHeaders = {
            apikey: EVO_KEY,
            "Content-Type": "application/json",
        };

        // 4. Buscar apenas grupos
        console.log(`[Import]: Buscando grupos...`);

        const groupsResponse = await fetch(
            `${EVO_URL}/group/fetchAllGroups/${instance_name}?getParticipants=false`,
            { headers: evoHeaders }
        );

        if (!groupsResponse.ok) {
            throw new Error("Erro ao buscar grupos da Evolution API");
        }

        const groupsData = await groupsResponse.json();

        // 5. Formatar grupos (excluir comunidades)
        const groups = (Array.isArray(groupsData) ? groupsData : [])
            .filter((group: any) => !group.isCommunity) // Exclui comunidades
            .map((group: any) => ({
                name: group.subject || 'Grupo sem nome',
                whatsapp_id: group.id,
                type: 'group'
            }));

        console.log(`[Import]: ${groups.length} grupos encontrados`);

        // 6. Usar apenas grupos (sem contatos)
        const allItems = groups;

        if (allItems.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                imported: 0,
                skipped: 0,
                total: 0,
                message: "Nenhum grupo ou contato encontrado"
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // 8. Criar cliente Service Role (para bypass RLS)
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // 9. Verificar duplicatas no banco (usando Service Role)
        const whatsappIds = allItems.map(item => item.whatsapp_id);

        const { data: existingGroups } = await supabaseAdmin
            .from('whatsapp_groups')
            .select('whatsapp_id')
            .eq('user_id', user.id)
            .in('whatsapp_id', whatsappIds);

        const existingIds = new Set(existingGroups?.map(g => g.whatsapp_id) || []);

        // 10. Filtrar apenas novos itens
        const newItems = allItems.filter(item => !existingIds.has(item.whatsapp_id));

        console.log(`[Import]: ${newItems.length} novos itens para importar`);

        if (newItems.length === 0) {
            return new Response(JSON.stringify({
                success: true,
                imported: 0,
                skipped: allItems.length,
                total: allItems.length,
                message: "Todos os itens já foram importados anteriormente"
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        // 11. Usar UPSERT ao invés de INSERT (evita erros de duplicata)
        const { error: upsertError } = await supabaseAdmin
            .from('whatsapp_groups')
            .upsert(
                newItems.map(item => ({
                    user_id: user.id,
                    name: item.name,
                    whatsapp_id: item.whatsapp_id,
                    is_active: true
                })),
                {
                    onConflict: 'user_id,whatsapp_id',
                    ignoreDuplicates: false
                }
            );

        if (upsertError) {
            console.error(`[Import]: Erro ao fazer upsert:`, upsertError);
            throw upsertError;
        }

        const skipped = allItems.length - newItems.length;

        console.log(`[Import]: ✅ ${newItems.length} importados, ${skipped} já existentes`);

        return new Response(JSON.stringify({
            success: true,
            imported: newItems.length,
            skipped: skipped,
            total: allItems.length,
            groups: groups.length
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("[Import]: Erro:", err);
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
