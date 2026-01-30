import React, { useState } from 'react';
import * as XLSX from 'xlsx'; // Importa a biblioteca instalada
import { supabase } from '../lib/supabase';

// --- CONFIGURAÇÃO DE MAPEAMENTO ---
// PREENCHA OS CÓDIGOS "UF_CRM_..." DO SEU BITRIX
const BITRIX_FIELD_MAP = {
    // --- CAMPOS NATIVOS DO BITRIX ---
    TITLE: 'Nº de Pedido da Plataforma', // Título do Negócio
    OPPORTUNITY: 'Quantia de Reembolso', // Valor
    CURRENCY_ID: 'Moeda',                // Moeda (BRL)

    // --- SEUS CAMPOS PERSONALIZADOS (Pegue os IDs no Bitrix) ---
    MARKETPLACE: 'UF_CRM_1769125430993',      // CSV: Plataforma
    STORE_NAME: 'UF_CRM_1767707826411',         // CSV: Loja
    TRACKING_NO: 'UF_CRM_1769468729223',         // CSV: Nº de Rastreio
    RETURN_ID: 'UF_CRM_ID_1769468083222',       // CSV: Pedidos de devolução
    RETURN_REASON: 'UF_CRM_1769468273095',         // CSV: Devolução/Razão de Reembolso
    RETURN_TYPE: 'UF_CRM_1769469291861',         // CSV: Tipo de Devolução
    PLATFORM_STATUS: 'UF_CRM_1769469412311',  // CSV: Status na Plataforma
    PRODUCT_SKU: 'UF_CRM_769468421997',              // CSV: Produtos/SKU de Variante
    AD_TITLE: 'UF_CRM_1769468405476',      // CSV: Título
    AD_ID: 'UF_CRM_1769468686576',             // CSV: ID do Anúncios
    COLLECTION_DATE: 'UF_CRM_1769611030661',  // CSV: Tempo de Devolução

    // --- NOVOS CAMPOS ADICIONADOS ---
    QUANTITY: 'UF_CRM_1769092781459',          // CSV: Qtd.
    SHIPPING_METHOD: 'UF_CRM_1768915318859',        // CSV: Envio
    REAL_REASON: 'UF_CRM_1769473904030',      // CSV: Observação (Mapeado sugestivo)
};

const OPERATOR_INSTRUCTIONS = `
📋 INSTRUÇÕES DE DEVOLUÇÃO:
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

    // --- PARSERS ---

    // 1. Parser Excel (.xlsx)
    const parseExcel = async (file: File) => {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        // Converte para JSON bruto (linhas como objetos)
        const json = XLSX.utils.sheet_to_json(worksheet);
        return json;
    };

    // 2. Parser CSV
    const parseCSV = async (file: File) => {
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim() !== '');
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

        return lines.slice(1).map(line => {
            const values: string[] = [];
            let currentVal = '';
            let insideQuote = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') insideQuote = !insideQuote;
                else if (char === ',' && !insideQuote) {
                    values.push(currentVal.trim().replace(/^"|"$/g, ''));
                    currentVal = '';
                } else currentVal += char;
            }
            values.push(currentVal.trim().replace(/^"|"$/g, ''));
            const row: any = {};
            headers.forEach((h, i) => row[h] = values[i] || '');
            return row;
        });
    };

    // 3. Parser XML
    const parseXML = async (file: File) => {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        const rows = Array.from(xmlDoc.documentElement.children);
        return rows.map(row => {
            const item: any = {};
            Array.from(row.children).forEach(col => {
                item[col.tagName] = col.textContent;
                // Mapeamentos manuais para XML
                if (col.tagName === 'N_de_Pedido_da_Plataforma') item['Nº de Pedido da Plataforma'] = col.textContent;
                if (col.tagName === 'Tempo_de_Devolucao') item['Tempo de Devolução'] = col.textContent;
            });
            return item;
        });
    };

    // Funções Auxiliares de Formatação
    const parseDate = (val: any) => {
        if (!val) return new Date();
        // Excel date number
        if (typeof val === 'number') {
            const date = new Date((val - (25567 + 2)) * 86400 * 1000);
            return date;
        }
        // String BR
        if (typeof val === 'string') {
            if (val.includes('T')) return new Date(val); // ISO
            const parts = val.split(/[\s/:]/); // Split por barra, espaço ou dois pontos
            if (parts.length >= 3) {
                // assumindo dia/mês/ano
                return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), Number(parts[3] || 12), Number(parts[4] || 0));
            }
        }
        return new Date();
    };

    const parseMoney = (val: any) => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            return parseFloat(val.replace('R$', '').replace('.', '').replace(',', '.').trim()) || 0;
        }
        return 0;
    };

    // --- PROCESSAMENTO ---
    const handleProcess = async () => {
        if (!file) return alert('Selecione um arquivo.');
        setLoading(true);
        setLogs([]);
        setProgress(0);

        try {
            let data: any[] = [];
            const ext = file.name.split('.').pop()?.toLowerCase();

            addLog(`📂 Lendo arquivo .${ext}...`);

            if (ext === 'xlsx' || ext === 'xls') {
                data = await parseExcel(file);
            } else if (ext === 'csv') {
                data = await parseCSV(file);
            } else if (ext === 'xml') {
                data = await parseXML(file);
            } else {
                throw new Error("Formato não suportado. Use .xlsx, .csv ou .xml");
            }

            if (!data || data.length === 0) throw new Error("Arquivo vazio ou ilegível.");

            addLog(`🔍 ${data.length} linhas encontradas. Conectando ao Bitrix...`);

            // Auth
            const { data: { user } } = await (supabase.auth as any).getUser();
            if (!user) throw new Error("Usuário não logado.");

            const { data: integ } = await supabase
                .from('integrations')
                .select('webhook_url')
                .eq('service_name', 'bitrix24')
                .eq('is_active', true)
                .eq('user_id', user.id)
                .limit(1)
                .maybeSingle();

            if (!integ?.webhook_url) throw new Error("Webhook Bitrix não configurado.");

            let dealUrl = integ.webhook_url.replace(/\/tasks\.task\.add.*/, '').replace(/\/user\.get.*/, '').replace(/\/$/, '');
            if (!dealUrl.endsWith('/crm.deal.add')) dealUrl += '/crm.deal.add';
            const commentUrl = dealUrl.replace('crm.deal.add', 'crm.timeline.comment.add');

            // Loop
            let success = 0;
            let errors = 0;

            for (let i = 0; i < data.length; i++) {
                const row = data[i];

                // Chaves flexíveis (Excel/CSV vs XML)
                const orderId = row['Nº de Pedido da Plataforma'] || row['N_de_Pedido_da_Plataforma'];

                if (!orderId) {
                    // Linha vazia ou cabeçalho perdido
                    continue;
                }

                // Datas
                const returnDateRaw = row['Tempo de Devolução'] || row['Tempo_de_Devolucao'] || row['Data da coleta'];
                const returnDate = parseDate(returnDateRaw);
                const deadline = new Date(returnDate);
                deadline.setDate(deadline.getDate() + 15);

                // Helper para pegar valor
                const getVal = (keys: string[]) => {
                    for (const k of keys) if (row[k] !== undefined) return row[k];
                    return '';
                };

                const fields: any = {
                    TITLE: orderId,
                    OPPORTUNITY: parseMoney(getVal(['Quantia de Reembolso', 'Quantia_de_Reembolso'])),
                    CURRENCY_ID: 'BRL',
                    CLOSEDATE: deadline.toISOString(),
                    OPENED: 'Y',
                    ASSIGNED_BY_ID: 1,

                    // Mapeamento Dinâmico
                    [BITRIX_FIELD_MAP.MARKETPLACE]: getVal(['Plataforma', 'Marketplace']),
                    [BITRIX_FIELD_MAP.STORE_NAME]: getVal(['Loja', 'Nome da Loja']),
                    [BITRIX_FIELD_MAP.TRACKING_NO]: getVal(['Nº de Rastreio', 'N_de_Rastreio']),
                    [BITRIX_FIELD_MAP.RETURN_ID]: getVal(['Pedidos de devolução', 'ID da devolução']),
                    [BITRIX_FIELD_MAP.RETURN_REASON]: getVal(['Devolução/Razão de Reembolso', 'Motivo do Reembolso']),
                    [BITRIX_FIELD_MAP.RETURN_TYPE]: getVal(['Tipo de Devolução']),
                    [BITRIX_FIELD_MAP.PLATFORM_STATUS]: getVal(['Status na Plataforma']),
                    [BITRIX_FIELD_MAP.PRODUCT_SKU]: getVal(['Produtos/SKU de Variante']),
                    [BITRIX_FIELD_MAP.AD_TITLE]: getVal(['Título', 'Título do anúncio']),
                    [BITRIX_FIELD_MAP.AD_ID]: getVal(['ID do Anúncios']),
                    [BITRIX_FIELD_MAP.COLLECTION_DATE]: returnDate.toISOString(),
                    [BITRIX_FIELD_MAP.QUANTITY]: parseInt(getVal(['Qtd.', 'Quantidade'])) || 1,
                    [BITRIX_FIELD_MAP.REAL_REASON]: getVal(['Observação', 'Motivo Real da Devolução']),

                    // Campos Extras
                    [BITRIX_FIELD_MAP.SALES_30_DAYS]: parseInt(getVal(['Vendas Últimos 30 dias'])) || 0,
                    [BITRIX_FIELD_MAP.AVG_PRICE]: parseMoney(getVal(['Preço Médio de Venda'])),
                };

                try {
                    const res = await fetch(dealUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fields })
                    });
                    const json = await res.json();

                    if (json.result) {
                        success++;
                        addLog(`✅ [${orderId}] Criado ID: ${json.result}`);
                        // Comentário
                        await fetch(commentUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ fields: { ENTITY_ID: json.result, ENTITY_TYPE: 'DEAL', COMMENT: OPERATOR_INSTRUCTIONS } })
                        });
                    } else {
                        errors++;
                        const msg = json.error_description || JSON.stringify(json);
                        addLog(`❌ [${orderId}] Erro: ${msg}`);
                    }
                } catch (e: any) {
                    errors++;
                    addLog(`❌ [${orderId}] Rede: ${e.message}`);
                }

                setProgress(Math.round(((i + 1) / data.length) * 100));
                // Pequeno delay para não bloquear UI
                if (i % 5 === 0) await new Promise(r => setTimeout(r, 10));
            }

            alert(`Finalizado! Sucessos: ${success}, Erros: ${errors}`);

        } catch (error: any) {
            addLog(`⛔ ERRO FATAL: ${error.message}`);
            alert(error.message);
        } finally {
            setLoading(false);
        }
    };

    const addLog = (msg: string) => setLogs(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p]);

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="space-y-1">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white">Importar Devoluções</h2>
                <p className="text-slate-500 text-sm">Suporte para Excel (.xlsx), CSV e XML.</p>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-sm">
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-10 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                    <span className="material-symbols-outlined text-4xl text-slate-400 mb-3">upload_file</span>
                    <p className="text-sm text-slate-500 mb-4">Arraste ou clique para selecionar</p>
                    <label className="cursor-pointer">
                        <span className="bg-primary text-white px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition">
                            Selecionar Arquivo
                        </span>
                        <input
                            type="file"
                            accept=".xlsx, .xls, .csv, .xml"
                            className="hidden"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                        />
                    </label>
                    {file && (
                        <div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 px-4 py-2 rounded-full border shadow-sm">
                            <span className="material-symbols-outlined text-emerald-500">check_circle</span>
                            {file.name}
                        </div>
                    )}
                </div>

                <div className="mt-6 flex justify-between items-center">
                    <div className="text-xs text-slate-400">* Configure os IDs dos campos no código.</div>
                    <button
                        onClick={handleProcess}
                        disabled={loading || !file}
                        className="px-8 py-3 bg-emerald-600 text-white rounded-lg font-bold shadow-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition-all transform active:scale-95"
                    >
                        {loading ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span> : <span className="material-symbols-outlined">rocket_launch</span>}
                        {loading ? `Processando ${progress}%` : 'Processar Arquivo'}
                    </button>
                </div>
            </div>

            <div className="bg-slate-950 text-emerald-400 rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs border border-slate-800 shadow-inner custom-scrollbar">
                {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600">
                        <span className="material-symbols-outlined text-3xl mb-2 opacity-50">terminal</span>
                        <p>Aguardando início...</p>
                    </div>
                ) : logs.map((log, i) => (
                    <div key={i} className={`border-b border-slate-800/50 py-1 ${log.includes('❌') ? 'text-rose-400' : ''} ${log.includes('⛔') ? 'text-red-500 font-bold' : ''}`}>
                        {log}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ImportReturns;