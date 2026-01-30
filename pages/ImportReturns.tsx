import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

// --- CONFIGURAÇÃO DE MAPEAMENTO (PREENCHER AQUI) ---
// Substitua os códigos 'UF_CRM_...' pelos códigos reais do seu Bitrix24
const BITRIX_FIELD_MAP = {
    // Campos Padrão do Bitrix
    TITLE: 'Nº de Pedido da Plataforma', // Vai para o Título do Negócio
    OPPORTUNITY: 'Quantia de Reembolso', // Vai para o Valor do Negócio
    CURRENCY_ID: 'Moeda',                // BRL

    // Campos Personalizados (Você precisa pegar esses IDs no seu Bitrix)
    STORE: 'UF_CRM_LOJA',               // Coluna: Loja (ex: SHP - Styllo Casa)
    PLATFORM: 'UF_CRM_PLATAFORMA',      // Coluna: Plataforma (ex: Shopee)
    TRACKING: 'UF_CRM_RASTREIO',        // Coluna: Nº de Rastreio
    RETURN_REASON: 'UF_CRM_MOTIVO',     // Coluna: Devolução/Razão de Reembolso
    PRODUCT_SKU: 'UF_CRM_SKU',          // Coluna: Produtos/SKU de Variante
    RETURN_DATE: 'UF_CRM_DATA_SOLIC',   // Coluna: Tempo de Devolução
    OBSERVATION: 'UF_CRM_OBS',          // Coluna: Observação
};

// Instruções que serão enviadas como comentário
const OPERATOR_INSTRUCTIONS = `
INSTRUÇÕES DE DEVOLUÇÃO:
1. Verificar integridade do produto recebido.
2. Conferir se o SKU corresponde ao pedido.
3. Tirar fotos do pacote e do produto.
4. Se estiver tudo ok, aprovar reembolso na plataforma.
5. Atualizar estoque no ERP.
6. Mover card para "Concluído".
`;

const ImportReturns: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);

    // Função para ler CSV (Simples, sem biblioteca externa para não quebrar build)
    const parseCSV = (text: string) => {
        const lines = text.split('\n').filter(l => l.trim() !== '');
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '')); // Remove aspas

        return lines.slice(1).map(line => {
            // Lógica para lidar com vírgulas dentro de aspas (comum em CSV)
            const values: string[] = [];
            let currentVal = '';
            let insideQuote = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    insideQuote = !insideQuote;
                } else if (char === ',' && !insideQuote) {
                    values.push(currentVal.trim().replace(/^"|"$/g, ''));
                    currentVal = '';
                } else {
                    currentVal += char;
                }
            }
            values.push(currentVal.trim().replace(/^"|"$/g, ''));

            // Mapeia array para objeto usando headers
            const row: any = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            return row;
        });
    };

    // Função para converter data "15/01/2026 10:32" para Objeto Date
    const parseDateString = (dateStr: string) => {
        try {
            if (!dateStr) return new Date();
            const [datePart, timePart] = dateStr.split(' ');
            const [day, month, year] = datePart.split('/');
            // const [hour, minute] = timePart.split(':'); // Opcional se quiser hora exata
            return new Date(Number(year), Number(month) - 1, Number(day));
        } catch (e) {
            return new Date();
        }
    };

    const handleProcess = async () => {
        if (!file) return alert('Selecione um arquivo CSV.');
        setLoading(true);
        setLogs([]);
        setProgress(0);

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            const data = parseCSV(text);

            addLog(`Lendo arquivo... ${data.length} registros encontrados.`);

            // 1. Obter URL do Webhook
            const { data: { user } } = await (supabase.auth as any).getUser();
            if (!user) {
                setLoading(false);
                return alert('Usuário não logado.');
            }

            const { data: integration } = await supabase
                .from('integrations')
                .select('webhook_url')
                .eq('service_name', 'bitrix24')
                .eq('is_active', true)
                .eq('user_id', user.id)
                .limit(1)
                .maybeSingle();

            if (!integration || !integration.webhook_url) {
                setLoading(false);
                return alert('Integração Bitrix24 não configurada. Vá em Configurações.');
            }

            // Preparar URLs da API
            let dealUrl = integration.webhook_url;
            if (dealUrl.includes('/tasks.task.add')) dealUrl = dealUrl.replace('/tasks.task.add', '/crm.deal.add');
            else if (dealUrl.includes('/user.get')) dealUrl = dealUrl.replace('/user.get', '/crm.deal.add');
            else dealUrl = `${dealUrl.replace(/\/$/, '')}/crm.deal.add`;

            const commentUrl = dealUrl.replace('crm.deal.add', 'crm.timeline.comment.add');

            // 2. Processar cada linha
            let successCount = 0;

            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                const orderId = row['Nº de Pedido da Plataforma'];

                if (!orderId) continue; // Pula linhas vazias

                // Calcular Deadline (Data da planilha + 15 dias)
                const returnDate = parseDateString(row['Tempo de Devolução']);
                const deadlineDate = new Date(returnDate);
                deadlineDate.setDate(deadlineDate.getDate() + 15);
                const formattedDeadline = deadlineDate.toISOString(); // Bitrix aceita ISO

                // Montar Payload do Negócio
                const fields: any = {
                    TITLE: orderId,
                    OPPORTUNITY: parseFloat(row['Quantia de Reembolso'] || '0'),
                    CURRENCY_ID: row['Moeda'] || 'BRL',
                    CLOSEDATE: formattedDeadline, // Prazo final
                    OPENED: 'Y',
                    ASSIGNED_BY_ID: 1, // Admin (ou lógica para pegar usuário)

                    // Campos Personalizados (Mapeados na constante acima)
                    [BITRIX_FIELD_MAP.STORE]: row['Loja'],
                    [BITRIX_FIELD_MAP.PLATFORM]: row['Plataforma'],
                    [BITRIX_FIELD_MAP.TRACKING]: row['Nº de Rastreio'],
                    [BITRIX_FIELD_MAP.RETURN_REASON]: row['Devolução/Razão de Reembolso'],
                    [BITRIX_FIELD_MAP.PRODUCT_SKU]: row['Produtos/SKU de Variante'],
                    [BITRIX_FIELD_MAP.RETURN_DATE]: row['Tempo de Devolução'],
                    [BITRIX_FIELD_MAP.OBSERVATION]: row['Observação'],
                };

                try {
                    // A. Criar Negócio
                    const resDeal = await fetch(dealUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fields })
                    });
                    const jsonDeal = await resDeal.json();

                    if (jsonDeal.result) {
                        const dealId = jsonDeal.result;
                        successCount++;
                        addLog(`✅ Criado negócio ID ${dealId} para pedido ${orderId}`);

                        // B. Adicionar Comentário de Instrução
                        await fetch(commentUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                fields: {
                                    ENTITY_ID: dealId,
                                    ENTITY_TYPE: 'DEAL',
                                    COMMENT: OPERATOR_INSTRUCTIONS
                                }
                            })
                        });

                    } else {
                        addLog(`❌ Erro ao criar pedido ${orderId}: ${jsonDeal.error_description || 'Erro desconhecido'}`);
                    }

                } catch (error: any) {
                    addLog(`❌ Erro de requisição no pedido ${orderId}: ${error.message}`);
                }

                // Atualizar progresso
                setProgress(Math.round(((i + 1) / data.length) * 100));

                // Pequeno delay para evitar rate limit do Bitrix (2 req/s)
                await new Promise(r => setTimeout(r, 500));
            }

            setLoading(false);
            alert(`Processo finalizado! ${successCount} devoluções importadas.`);
        };

        reader.readAsText(file);
    };

    const addLog = (msg: string) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="space-y-1">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Importar Devoluções</h2>
                <p className="text-slate-500 text-sm">Carregue a planilha CSV para criar negócios de devolução no Bitrix24.</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-sm">

                {/* Área de Upload */}
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-10 bg-slate-50 dark:bg-slate-800/50">
                    <span className="material-symbols-outlined text-4xl text-slate-400 mb-3">upload_file</span>
                    <label className="cursor-pointer">
                        <span className="bg-primary text-white px-4 py-2 rounded-lg font-bold hover:opacity-90 transition">Selecionar Arquivo CSV</span>
                        <input
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                        />
                    </label>
                    {file && <p className="mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">{file.name}</p>}
                </div>

                {/* Botão de Ação */}
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleProcess}
                        disabled={loading || !file}
                        className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-bold shadow-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span> : <span className="material-symbols-outlined">play_arrow</span>}
                        {loading ? `Processando ${progress}%...` : 'Iniciar Importação'}
                    </button>
                </div>
            </div>

            {/* Logs */}
            <div className="bg-slate-900 text-slate-300 rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs border border-slate-700 shadow-inner">
                {logs.length === 0 ? (
                    <p className="text-slate-500 italic">O log de processamento aparecerá aqui...</p>
                ) : (
                    logs.map((log, idx) => <div key={idx}>{log}</div>)
                )}
            </div>

            {/* Aviso sobre Mapeamento */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4 rounded-lg text-xs text-yellow-800 dark:text-yellow-200">
                <strong>Atenção Desenvolvedor:</strong> Para que os campos personalizados (Loja, Plataforma, etc.) apareçam no Bitrix,
                você deve editar o arquivo <code>ImportReturns.tsx</code> e preencher a constante <code>BITRIX_FIELD_MAP</code>
                com os IDs (ex: UF_CRM_XXXX) encontrados nas configurações do seu CRM Bitrix.
            </div>
        </div>
    );
};

export default ImportReturns;