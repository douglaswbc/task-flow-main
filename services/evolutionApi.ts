// src/services/evolutionApi.ts
import { supabase } from '../lib/supabase';

/* =====================================================
 * TIPOS E INTERFACES
 * ===================================================== */
export interface WhatsAppInstance {
    id: string;
    profile_id: string;
    instance_name: string;
    token?: string;
    connection_status: 'open' | 'close' | 'connecting';
    phone_number?: string;
    profile_pic_url?: string;
    qr_code?: string;
    webhook_url?: string;
    created_at: string;
    updated_at: string;
}

/* =====================================================
 * ENV & CONFIG
 * ===================================================== */
const EVO_URL = import.meta.env.VITE_EVO_API_URL || '';
const EVO_KEY = import.meta.env.VITE_EVO_API_KEY || '';
const GLOBAL_WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL_WHATSAPP || '';

const headers = {
    apikey: EVO_KEY,
    'Content-Type': 'application/json',
};

/* =====================================================
 * FUNÇÕES AUXILIARES
 * ===================================================== */

/**
 * Obtém o ID do perfil do usuário autenticado
 */
const getCurrentProfileId = async (): Promise<string> => {
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        throw new Error('Usuário não autenticado');
    }

    return user.id;
};

/**
 * Gera um nome único e curto para a instância baseado no nome fornecido
 */
const generateUniqueInstanceName = (baseName: string): string => {
    const sanitized = baseName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .replace(/[^a-z0-9]/g, '_')
        .substring(0, 15); // Limita a 15 caracteres
    const random = Math.random().toString(36).substring(2, 8); // 6 caracteres aleatórios
    return `${sanitized}_${random}`;
};

/* =====================================================
 * API DE INSTÂNCIAS WHATSAPP
 * ===================================================== */

export const evolutionApi = {
    instances: {
        /**
         * Lista todas as instâncias do usuário autenticado
         */
        list: async (): Promise<WhatsAppInstance[]> => {
            const profileId = await getCurrentProfileId();

            const { data: dbInstances, error } = await supabase
                .from('whatsapp_instances')
                .select('*')
                .eq('profile_id', profileId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (!dbInstances?.length) return [];

            // Busca status atualizado da Evolution API
            try {
                const response = await fetch(`${EVO_URL}/instance/fetchInstances`, { headers });
                const evoArray = await response.json();

                return dbInstances.map((dbInst) => {
                    const evoInst = Array.isArray(evoArray)
                        ? evoArray.find(
                            (e: any) =>
                                e.instance?.instanceName?.toLowerCase().trim() ===
                                dbInst.instance_name?.toLowerCase().trim()
                        )
                        : null;

                    return {
                        ...dbInst,
                        connection_status: evoInst?.instance?.state || dbInst.connection_status || 'close',
                        phone_number: evoInst?.instance?.owner
                            ? evoInst.instance.owner.split('@')[0]
                            : dbInst.phone_number || 'Não vinculado',
                        profile_pic_url: evoInst?.instance?.profilePicUrl || dbInst.profile_pic_url || null,
                    };
                });
            } catch (err) {
                console.error('Erro ao buscar status das instâncias:', err);
                return dbInstances;
            }
        },

        /**
         * Cria uma nova instância na Evolution API e registra no banco
         */
        create: async (displayName: string) => {
            const profileId = await getCurrentProfileId();
            const instanceName = generateUniqueInstanceName(displayName);

            const body = {
                instanceName,
                integration: 'WHATSAPP-BAILEYS',
                webhook: {
                    url: GLOBAL_WEBHOOK_URL,
                    byEvents: false,
                    base64: true,
                    enabled: true,
                    events: [
                        'MESSAGES_UPSERT'],
                },
            };

            const response = await fetch(`${EVO_URL}/instance/create`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData?.message || 'Erro ao criar instância na Evolution API');
            }

            const evoData = await response.json();

            // Registra no banco de dados
            const { data, error } = await supabase
                .from('whatsapp_instances')
                .insert({
                    profile_id: profileId,
                    instance_name: instanceName,
                    token: evoData.hash || evoData.instance?.hash,
                    connection_status: 'close',
                    webhook_url: GLOBAL_WEBHOOK_URL,
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        /**
         * Gera QR Code para conexão
         */
        connect: async (instanceName: string): Promise<string> => {
            const res = await fetch(`${EVO_URL}/instance/connect/${instanceName}`, { headers });

            if (!res.ok) {
                throw new Error('Erro ao gerar QR Code');
            }

            const data = await res.json();
            const qrCode = data.base64 || data.code || '';

            // Atualiza o QR Code no banco
            await supabase
                .from('whatsapp_instances')
                .update({
                    qr_code: qrCode,
                    connection_status: 'connecting'
                })
                .eq('instance_name', instanceName);

            return qrCode;
        },

        /**
         * Verifica o status da conexão
         */
        checkStatus: async (instanceName: string): Promise<'open' | 'close' | 'connecting'> => {
            try {
                const response = await fetch(
                    `${EVO_URL}/instance/connectionState/${instanceName}`,
                    { headers }
                );

                if (!response.ok) return 'close';

                const data = await response.json();
                const status = data.instance?.state || 'close';

                // Atualiza status no banco
                await supabase
                    .from('whatsapp_instances')
                    .update({ connection_status: status })
                    .eq('instance_name', instanceName);

                return status;
            } catch {
                return 'close';
            }
        },

        /**
         * Desconecta (Logout) a instância
         */
        logout: async (instanceName: string) => {
            const response = await fetch(`${EVO_URL}/instance/logout/${instanceName}`, {
                method: 'DELETE',
                headers,
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMsg = errorData?.response?.message;

                // Ignora erro se já estiver desconectado
                if (!(typeof errorMsg === 'string' && errorMsg.includes('Connection Closed'))) {
                    throw new Error('Falha ao desconectar instância.');
                }
            }

            // Atualiza status no banco
            await supabase
                .from('whatsapp_instances')
                .update({
                    connection_status: 'close',
                    qr_code: null,
                    phone_number: null
                })
                .eq('instance_name', instanceName);
        },

        /**
         * Reinicia a instância
         */
        restart: async (instanceName: string) => {
            const response = await fetch(`${EVO_URL}/instance/restart/${instanceName}`, {
                method: 'POST',
                headers,
            });

            if (!response.ok) {
                throw new Error('Falha ao reiniciar instância.');
            }

            return response.json();
        },

        /**
         * Remove a instância da Evolution API e do banco
         */
        delete: async (instanceName: string) => {
            // Remove da Evolution API
            await fetch(`${EVO_URL}/instance/delete/${instanceName}`, {
                method: 'DELETE',
                headers,
            });

            // Remove do banco de dados
            await supabase
                .from('whatsapp_instances')
                .delete()
                .eq('instance_name', instanceName);
        },
    },

    /* ================= GROUPS ================= */
    groups: {
        /**
         * Lista todos os grupos do WhatsApp
         */
        fetchAll: async (instanceName: string) => {
            const response = await fetch(
                `${EVO_URL}/group/fetchAllGroups/${instanceName}?getParticipants=false`,
                { headers }
            );

            if (!response.ok) {
                throw new Error('Erro ao buscar grupos do WhatsApp');
            }

            const data = await response.json();
            return data;
        },
    },

    /* ================= CONTACTS ================= */
    contacts: {
        /**
         * Lista todos os contatos do WhatsApp
         */
        findAll: async (instanceName: string) => {
            const response = await fetch(
                `${EVO_URL}/chat/findContacts/${instanceName}`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({}),
                }
            );

            if (!response.ok) {
                throw new Error('Erro ao buscar contatos do WhatsApp');
            }

            const data = await response.json();
            return data;
        },
    },

    /* ================= MESSAGES ================= */
    messages: {
        /**
         * Envia mensagem de texto
         */
        send: async (instanceName: string, number: string, text: string) => {
            const res = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ number, text }),
            });

            if (!res.ok) {
                throw new Error('Erro ao enviar mensagem via WhatsApp');
            }

            return res.json();
        },

        /**
         * Envia mídia (Imagem, PDF, etc)
         */
        sendMedia: async (
            instanceName: string,
            number: string,
            mediaBase64: string,
            fileName: string,
            caption?: string
        ) => {
            const res = await fetch(`${EVO_URL}/message/sendMedia/${instanceName}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    number,
                    media: mediaBase64,
                    fileName,
                    caption: caption || '',
                    mediaType: fileName.toLowerCase().endsWith('.pdf') ? 'document' : 'image'
                }),
            });

            if (!res.ok) {
                throw new Error('Erro ao enviar mídia via WhatsApp');
            }

            return res.json();
        },
    }
};
