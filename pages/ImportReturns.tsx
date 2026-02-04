import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import toast, { Toaster } from 'react-hot-toast'; // <--- IMPORTANTE

// --- CONFIGURAÇÃO ---
const BITRIX_FIELD_MAP = {
    OPPORTUNITY: 'Quantia de Reembolso',
    CURRENCY_ID: 'Moeda',
    MARKETPLACE: 'UF_CRM_1769125430993',
    STORE_NAME: 'UF_CRM_1767707826411',
    TRACKING_NO: 'UF_CRM_1769468729223',
    RETURN_ID: 'UF_CRM_1769468083222',
    RETURN_REASON: 'UF_CRM_1769468273095',
    RETURN_TYPE: 'UF_CRM_1769469291861',
    PLATFORM_STATUS: 'UF_CRM_1769469412311',
    PRODUCT_SKU: 'UF_CRM_1769468421997',
    AD_TITLE: 'UF_CRM_1769468405476',
    AD_ID: 'UF_CRM_1769468686576',
    COLLECTION_DATE: 'UF_CRM_1769611030661',
    QUANTITY: 'UF_CRM_1769468707842',
    SHIPPING_METHOD: 'UF_CRM_1768915318859',
    REAL_REASON: 'UF_CRM_1769473904030',
    STATE: 'UF_CRM_ESTADO',
    VARIANT_VALUE: 'UF_CRM_VALOR_VARIANTE',
    PRICE: 'UF_CRM_1767709999596',
    LOGISTICS_STATUS: 'UF_CRM_STATUS_LOG',
};

const LIST_VALUES_MAP: Record<string, Record<string, string | number>> = {
    MARKETPLACE: { "Shopee": 55, "Magalu": 57, "Kwai": 59, "Mercado Livre": 61, "TikTok": 63, "Amazon": 65 },
    STORE_NAME: { "SHP - Styllo Casa": 51, "SHP - Ops comprei!": 53 },
    RETURN_TYPE: { "RETURN_REFUND": 69, "REFUND": 67 },
    PLATFORM_STATUS: { "ACCEPTED": 71, "CANCELLED": 75 }
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

    const [showAccessModal, setShowAccessModal] = useState(false);
    const [accessCode, setAccessCode] = useState('');
    const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
    const [verifyingCode, setVerifyingCode] = useState(false);

    useEffect(() => {
        if (!webhookUrl) {
            setShowAccessModal(true);
        }
    }, [webhookUrl]);

    // --- PARSERS ---
    const parseExcel = async (file: File) => {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_json(worksheet);
    };

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

    const parseXML = async (file: File) => {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        const rows = Array.from(xmlDoc.documentElement.children);
        return rows.map(row => {
            const item: any = {};
            Array.from(row.children).forEach(col => {
                item[col.tagName] = col.textContent;
                if (col.tagName === 'N_de_Pedido_da_Plataforma') item['Nº de Pedido da Plataforma'] = col.textContent;
                if (col.tagName === 'Tempo_de_Devolucao') item['Tempo de Devolução'] = col.textContent;
            });
            return item;
        });
    };

    const parseDate = (val: any) => {
        if (!val) return new Date();
        if (typeof val === 'number') return new Date((val - (25567 + 2)) * 86400 * 1000);
        if (typeof val === 'string') {
            if (val.includes('T')) return new Date(val);
            const parts = val.split(/[\s/:]/);
            if (parts.length >= 3) return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), Number(parts[3] || 12), Number(parts[4] || 0));
        }
        return new Date();
    };

    const parseMoney = (val: any) => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return Number(val.toFixed(2));
        if (typeof val === 'string') {
            let v = val.replace(/[^\d.,-]/g, '').trim();
            if (v.includes('.') && v.includes(',')) v = v.lastIndexOf(',') > v.lastIndexOf('.') ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
            else if (v.includes(',')) v = v.replace(',', '.');
            const num = parseFloat(v);
            return isNaN(num) ? 0 : Number(num.toFixed(2));
        }
        return 0;
    };

    const getListValue = (category: string, value: any) => {
        if (!value) return '';
        const map = LIST_VALUES_MAP[category];
        if (!map) return value;
        const valStr = String(value).trim().toLowerCase();
        const foundKey = Object.keys(map).find(k => k.toLowerCase() === valStr);
        return foundKey ? map[foundKey] : value;
    };

    const addLog = (msg: string) => setLogs(p => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...p]);

    // --- VERIFICAÇÃO DO CÓDIGO ---
    const verifyAccessCode = async () => {
        const normalizedCode = accessCode.trim().toLowerCase();
        if (!normalizedCode) return toast.error("Digite o código de acesso.");

        setVerifyingCode(true);
        try {
            const { data, error } = await supabase.rpc('get_webhook_by_code', { code_input: normalizedCode });
            if (error) throw error;
            if (data) {
                setWebhookUrl(data);
                setShowAccessModal(false);
                toast.success("Acesso liberado com sucesso!", { duration: 3000 });
                addLog("🔓 Acesso liberado! Integração localizada.");
            } else {
                toast.error("Código inválido ou loja inativa.");
                setAccessCode('');
            }
        } catch (err: any) {
            console.error(err);
            toast.error("Erro ao verificar: " + err.message);
        } finally {
            setVerifyingCode(false);
        }
    };

    // --- CHECK DUPLICIDADE ---
    const checkDealExists = async (title: string, listUrl: string): Promise<string | false> => {
        try {
            const res = await fetch(listUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filter: { "TITLE": title },
                    select: ["ID"]
                })
            });
            const data = await res.json();
            if (data.result && data.result.length > 0) {
                return data.result[0].ID;
            }
            return false;
        } catch (error) {
            console.error("Erro verificação", error);
            return false;
        }
    };

    // --- PROCESSAMENTO ---
    const handleStartProcess = () => {
        if (!file) return toast.error('Por favor, selecione um arquivo primeiro.');
        if (!webhookUrl) {
            setShowAccessModal(true);
            return;
        }

        // Inicia com um toast de loading que pode ser atualizado depois se quiser
        toast.promise(
            runImportLogic(),
            {
                loading: 'Processando arquivo...',
                success: 'Processo finalizado!',
                error: 'Erro ao processar.',
            }
        );
    };

    const runImportLogic = async () => {
        setLoading(true);
        setLogs([]);
        setProgress(0);

        try {
            if (!webhookUrl) throw new Error("Webhook perdido. Recarregue a página.");

            let data: any[] = [];
            const ext = file!.name.split('.').pop()?.toLowerCase();

            addLog(`📂 Lendo arquivo .${ext}...`);

            if (ext === 'xlsx' || ext === 'xls') data = await parseExcel(file!);
            else if (ext === 'csv') data = await parseCSV(file!);
            else if (ext === 'xml') data = await parseXML(file!);
            else throw new Error("Formato não suportado.");

            if (!data || data.length === 0) throw new Error("O arquivo está vazio.");

            addLog(`🔍 ${data.length} registros encontrados.`);

            const baseApiUrl = webhookUrl.replace(/\/tasks\.task\.add.*/, '').replace(/\/user\.get.*/, '').replace(/\/$/, '');
            const dealListUrl = `${baseApiUrl}/crm.deal.list`;

            let success = 0;
            let errors = 0;
            let skipped = 0;
            let itemsToProcess = [];

            addLog(`🔎 Verificando duplicidade de todos os itens...`);
            for (let i = 0; i < data.length; i++) {
                const row = data[i];

                const getVal = (keys: string[]) => {
                    const rowKeys = Object.keys(row);
                    for (const k of keys) {
                        if (row[k] !== undefined) return row[k];
                        const foundKey = rowKeys.find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
                        if (foundKey && row[foundKey] !== undefined) return row[foundKey];
                    }
                    return '';
                };

                const orderId = getVal(['Nº de Pedido da Plataforma', 'N_de_Pedido_da_Plataforma']);
                const productTitle = getVal(['Título', 'Titulo', 'Título do anúncio']);

                if (!orderId) continue;

                const finalTitle = orderId;
                const existingId = await checkDealExists(finalTitle, dealListUrl);

                if (existingId) {
                    addLog(`⚠️ [${orderId}] Ignorado: Já existe (ID: ${existingId})`);
                    skipped++;
                    continue;
                }

                const returnDateRaw = getVal(['Tempo de Devolução', 'Tempo_de_Devolucao', 'Data da coleta']);
                const returnDate = parseDate(returnDateRaw);
                const deadline = new Date(returnDate);
                deadline.setDate(deadline.getDate() + 15);

                itemsToProcess.push({
                    orderId,
                    fields: {
                        TITLE: finalTitle,
                        OPPORTUNITY: parseMoney(getVal(['Quantia de Reembolso', 'Quantia_de_Reembolso'])),
                        CURRENCY_ID: 'BRL',
                        CLOSEDATE: deadline.toISOString(),
                        CATEGORY_ID: 3,
                        OPENED: 'Y',
                        ASSIGNED_BY_ID: 1,

                        [BITRIX_FIELD_MAP.MARKETPLACE]: getListValue('MARKETPLACE', getVal(['Plataforma', 'Marketplace'])),
                        [BITRIX_FIELD_MAP.STORE_NAME]: getListValue('STORE_NAME', getVal(['Loja', 'Nome da Loja'])),
                        [BITRIX_FIELD_MAP.RETURN_TYPE]: getListValue('RETURN_TYPE', getVal(['Tipo de Devolução'])),
                        [BITRIX_FIELD_MAP.PLATFORM_STATUS]: getListValue('PLATFORM_STATUS', getVal(['Status na Plataforma'])),
                        [BITRIX_FIELD_MAP.TRACKING_NO]: getVal(['Nº de Rastreio', 'N_de_Rastreio']),
                        [BITRIX_FIELD_MAP.RETURN_ID]: getVal(['Pedidos de devolução', 'ID da devolução']),
                        [BITRIX_FIELD_MAP.RETURN_REASON]: getVal(['Devolução/Razão de Reembolso', 'Motivo do Reembolso']),
                        [BITRIX_FIELD_MAP.PRODUCT_SKU]: getVal(['Produtos/SKU de Variante']),
                        [BITRIX_FIELD_MAP.AD_TITLE]: productTitle,
                        [BITRIX_FIELD_MAP.AD_ID]: getVal(['ID do Anúncios']),
                        [BITRIX_FIELD_MAP.COLLECTION_DATE]: returnDate.toISOString(),
                        [BITRIX_FIELD_MAP.QUANTITY]: parseInt(getVal(['Qtd.', 'Quantidade'])) || 1,
                        [BITRIX_FIELD_MAP.SHIPPING_METHOD]: getVal(['Envio', 'Envio']),
                        [BITRIX_FIELD_MAP.REAL_REASON]: getVal(['Observação', 'Motivo Real da Devolução']),
                        [BITRIX_FIELD_MAP.STATE]: getVal(['Estado']),
                        [BITRIX_FIELD_MAP.VARIANT_VALUE]: parseMoney(getVal(['Valor de Variante'])),
                        [BITRIX_FIELD_MAP.PRICE]: parseMoney(getVal(['Preço'])),
                        [BITRIX_FIELD_MAP.LOGISTICS_STATUS]: getVal(['Estado de Logística']),
                    }
                });
            }

            if (itemsToProcess.length === 0) {
                addLog(`ℹ️ Nenhum novo item para importar.`);
            } else {
                addLog(`🚀 Iniciando importação cadenciada de ${itemsToProcess.length} itens via Edge Function...`);

                let currentIndex = 0;
                while (currentIndex < itemsToProcess.length) {
                    const batch = itemsToProcess.slice(currentIndex);

                    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('bitrix-bulk-import', {
                        body: {
                            items: batch,
                            webhookUrl,
                            operatorInstructions: OPERATOR_INSTRUCTIONS
                        }
                    });

                    if (edgeError) throw edgeError;

                    const batchResults = edgeData.results || [];
                    batchResults.forEach((r: any) => {
                        if (r.success) {
                            success++;
                            addLog(`✅ [${r.orderId}] Criado! ID: ${r.id}`);
                        } else {
                            errors++;
                            addLog(`❌ [${r.orderId}] Erro: ${r.error}`);
                        }
                    });

                    currentIndex += batchResults.length;
                    setProgress(Math.round((currentIndex / itemsToProcess.length) * 100));

                    if (edgeData.status === 'partial') {
                        addLog(`⏳ Limite de tempo atingido. Retomando o restante...`);
                    }
                }
            }

            // --- NOTIFICAÇÃO PERSONALIZADA FINAL (Estilo Recibo) ---
            toast((t) => (
                <div className="flex flex-col gap-2 min-w-[200px]">
                    <div className="font-bold text-slate-800">Resumo da Importação</div>
                    <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                            <span className="text-emerald-600 font-bold">✅ Criados:</span>
                            <span>{success}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-blue-600 font-bold">⚠️ Ignorados:</span>
                            <span>{skipped}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-red-600 font-bold">❌ Erros:</span>
                            <span>{errors}</span>
                        </div>
                    </div>
                    <button
                        className="mt-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs py-1 px-2 rounded w-full"
                        onClick={() => toast.dismiss(t.id)}
                    >
                        Fechar
                    </button>
                </div>
            ), { duration: 6000 });

        } catch (error: any) {
            addLog(`⛔ ERRO: ${error.message}`);
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Componente de Notificações */}
            <Toaster position="top-right" />

            <div className="space-y-1">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white">Importar Devoluções</h2>
                <p className="text-slate-500 text-sm">Área Pública - Requer Código de Acesso.</p>
            </div>

            <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 shadow-sm transition-all ${!webhookUrl ? 'opacity-50 blur-[2px] pointer-events-none' : ''}`}>
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-10 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                    <span className="material-symbols-outlined text-4xl text-slate-400 mb-3">upload_file</span>
                    <p className="text-sm text-slate-500 mb-4">Suporte para Excel (.xlsx), CSV e XML</p>
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
                    <div className="text-xs text-slate-400">
                        {webhookUrl ? <span className="text-emerald-500 font-bold flex items-center gap-1"><span className="material-symbols-outlined text-sm">lock_open</span> Acesso Liberado</span> : <span>* Será necessário informar o código da loja.</span>}
                    </div>
                    <button
                        onClick={handleStartProcess}
                        disabled={loading || !file}
                        className="px-8 py-3 bg-emerald-600 text-white rounded-lg font-bold shadow-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition-all transform active:scale-95"
                    >
                        {loading ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span> : <span className="material-symbols-outlined">rocket_launch</span>}
                        {loading ? `Processando ${progress}%` : 'Iniciar Importação'}
                    </button>
                </div>
            </div>

            {/* Console de Logs */}
            <div className="bg-slate-950 text-emerald-400 rounded-xl p-4 h-64 overflow-y-auto font-mono text-xs border border-slate-800 shadow-inner custom-scrollbar">
                {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600">
                        <span className="material-symbols-outlined text-3xl mb-2 opacity-50">terminal</span>
                        <p>Aguardando início...</p>
                    </div>
                ) : logs.map((log, i) => (
                    <div key={i} className={`border-b border-slate-800/50 py-1 ${log.includes('❌') ? 'text-rose-400' : ''} ${log.includes('⚠️') ? 'text-yellow-400' : ''} ${log.includes('⛔') ? 'text-red-500 font-bold' : ''}`}>
                        {log}
                    </div>
                ))}
            </div>

            {/* --- MODAL DE CÓDIGO --- */}
            {showAccessModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden p-6 animate-in zoom-in-95 duration-200">
                        <div className="text-center mb-6">
                            <div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-2xl">lock</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Acesso Restrito</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Informe o código da loja para liberar o sistema.</p>
                        </div>

                        <div className="space-y-4">
                            <input
                                type="text"
                                placeholder="Ex: LOJA01"
                                className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-center text-lg font-bold tracking-widest uppercase focus:ring-2 focus:ring-primary outline-none"
                                value={accessCode}
                                onChange={e => setAccessCode(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && verifyAccessCode()}
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={verifyAccessCode}
                                    disabled={verifyingCode || !accessCode}
                                    className="w-full py-3 bg-primary text-white font-bold rounded-lg hover:opacity-90 disabled:opacity-50 shadow-lg shadow-primary/30"
                                >
                                    {verifyingCode ? 'Verificando...' : 'Liberar Acesso'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImportReturns;