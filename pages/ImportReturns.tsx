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

const IMPORT_STORAGE_KEY = 'taskflow_pending_import';

const ImportReturns: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);

    const [showAccessModal, setShowAccessModal] = useState(false);
    const [accessCode, setAccessCode] = useState('');
    const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
    const [verifyingCode, setVerifyingCode] = useState(false);

    // --- ESTADO DE IMPORTAÇÃO PERSISTENTE ---
    const [isPaused, setIsPaused] = useState(false);
    const [itemsToProcess, setItemsToProcess] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [stats, setStats] = useState({ success: 0, errors: 0, skipped: 0 });
    const [hasPendingImport, setHasPendingImport] = useState(false);

    useEffect(() => {
        if (!webhookUrl) {
            setShowAccessModal(true);
        }
    }, [webhookUrl]);

    // Carregar estado pendente do localStorage
    useEffect(() => {
        const saved = localStorage.getItem(IMPORT_STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.items && parsed.items.length > parsed.index) {
                    setItemsToProcess(parsed.items);
                    setCurrentIndex(parsed.index);
                    setStats(parsed.stats || { success: 0, errors: 0, skipped: 0 });
                    setHasPendingImport(true);
                    addLog(`💾 Importação pendente localizada: ${parsed.items.length - parsed.index} itens restantes.`);
                }
            } catch (e) {
                console.error("Erro ao carregar estado salvo", e);
                localStorage.removeItem(IMPORT_STORAGE_KEY);
            }
        }
    }, []);

    // Salvar estado sempre que mudar o progresso
    useEffect(() => {
        if (itemsToProcess.length > 0 && currentIndex < itemsToProcess.length) {
            localStorage.setItem(IMPORT_STORAGE_KEY, JSON.stringify({
                items: itemsToProcess,
                index: currentIndex,
                stats: stats
            }));
        } else if (itemsToProcess.length > 0 && currentIndex >= itemsToProcess.length) {
            localStorage.removeItem(IMPORT_STORAGE_KEY);
        }
    }, [currentIndex, itemsToProcess, stats]);

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

        toast.promise(
            startNewImport(),
            {
                loading: 'Analisando arquivo...',
                success: 'Análise concluída!',
                error: (err) => `Erro: ${err.message}`,
            }
        );
    };

    const startNewImport = async () => {
        setLoading(true);
        setLogs([]);
        setProgress(0);
        setIsPaused(false);
        setStats({ success: 0, errors: 0, skipped: 0 });

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

            let skippedCount = 0;
            let prepItems = [];

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
                    skippedCount++;
                    continue;
                }

                const returnDateRaw = getVal(['Tempo de Devolução', 'Tempo_de_Devolucao', 'Data da coleta']);
                const returnDate = parseDate(returnDateRaw);
                const deadline = new Date(returnDate);
                deadline.setDate(deadline.getDate() + 15);

                prepItems.push({
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

            setItemsToProcess(prepItems);
            setCurrentIndex(0);
            setStats({ success: 0, errors: 0, skipped: skippedCount });
            setHasPendingImport(false);

            // Inicia o envio
            processLoop(prepItems, 0, { success: 0, errors: 0, skipped: skippedCount });

        } catch (error: any) {
            addLog(`⛔ ERRO: ${error.message}`);
            toast.error(error.message);
            setLoading(false);
        }
    };

    const resumeImport = () => {
        if (!webhookUrl) return setShowAccessModal(true);
        setLoading(true);
        setIsPaused(false);
        processLoop(itemsToProcess, currentIndex, stats);
    };

    const processLoop = async (items: any[], startIdx: number, initialStats: typeof stats) => {
        let currentIdx = startIdx;
        let localStats = { ...initialStats };

        addLog(`🚀 Iniciando/Retomando importação de ${items.length - startIdx} itens...`);

        try {
            while (currentIdx < items.length) {
                // Verificar se foi pausado
                if (isPaused) {
                    addLog("⏸️ Importação pausada pelo usuário.");
                    setLoading(false);
                    return;
                }

                const batch = items.slice(currentIdx);
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
                        localStats.success++;
                        addLog(`✅ [${r.orderId}] Criado! ID: ${r.id}`);
                    } else {
                        localStats.errors++;
                        addLog(`❌ [${r.orderId}] Erro: ${r.error}`);
                    }
                });

                currentIdx += batchResults.length;
                setCurrentIndex(currentIdx);
                setStats({ ...localStats });
                setProgress(Math.round((currentIdx / (items.length + localStats.skipped)) * 100));

                if (edgeData.status === 'partial') {
                    addLog(`⏳ Limite de tempo (60s) atingido. Retomando próximo lote...`);
                }
            }

            // Fim do processo
            addLog("🏁 Importação finalizada com sucesso!");
            showFinalToast(localStats);
            localStorage.removeItem(IMPORT_STORAGE_KEY);
            setHasPendingImport(false);
            setItemsToProcess([]);

        } catch (error: any) {
            addLog(`⛔ ERRO NO PROCESSO: ${error.message}`);
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePause = () => {
        setIsPaused(true);
        addLog("⏳ Pausando processo...");
    };

    const showFinalToast = (finalStats: typeof stats) => {
        toast((t) => (
            <div className="flex flex-col gap-2 min-w-[200px]">
                <div className="font-bold text-slate-800 text-center">Resumo da Importação</div>
                <div className="text-sm space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div className="flex justify-between">
                        <span className="text-emerald-600 font-bold">✅ Criados:</span>
                        <span>{finalStats.success}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1">
                        <span className="text-blue-600 font-bold">⚠️ Ignorados:</span>
                        <span>{finalStats.skipped}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-1">
                        <span className="text-red-500 font-bold">❌ Erros:</span>
                        <span>{finalStats.errors}</span>
                    </div>
                </div>
                <button className="mt-2 bg-slate-900 text-white text-xs py-2 rounded-lg font-bold hover:bg-slate-800 transition" onClick={() => toast.dismiss(t.id)}>Fechar</button>
            </div>
        ), { duration: 8000 });
    };

    const clearPending = () => {
        localStorage.removeItem(IMPORT_STORAGE_KEY);
        setHasPendingImport(false);
        setItemsToProcess([]);
        setCurrentIndex(0);
        setStats({ success: 0, errors: 0, skipped: 0 });
        setProgress(0);
        addLog("🗑️ Importação pendente descartada.");
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20">
            <Toaster position="top-right" />

            <div className="flex justify-between items-end">
                <div className="space-y-1">
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <span className="bg-emerald-500/10 p-2 rounded-lg"><span className="material-symbols-outlined text-emerald-500 text-3xl">upload_file</span></span>
                        Importar Devoluções
                    </h2>
                    <p className="text-slate-500 text-sm">Integração cadenciada com persistência local.</p>
                </div>
                {hasPendingImport && !loading && (
                    <div className="animate-bounce">
                        <span className="bg-amber-500 text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-lg">RETOMADA DISPONÍVEL</span>
                    </div>
                )}
            </div>

            {hasPendingImport && !loading && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-4 rounded-xl flex items-center justify-between shadow-sm animate-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-amber-600">history</span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Importação Incompleta</p>
                            <p className="text-xs text-amber-700 dark:text-amber-400">Restam {itemsToProcess.length - currentIndex} itens para enviar.</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={clearPending} className="px-4 py-2 text-xs font-bold text-amber-700 hover:text-amber-800 transition">Descartar</button>
                        <button onClick={resumeImport} className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">play_arrow</span> Retomar
                        </button>
                    </div>
                </div>
            )}

            <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm transition-all ${(!webhookUrl || loading) && !hasPendingImport ? 'opacity-50 blur-[1px]' : ''}`}>
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-10 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full shadow-md flex items-center justify-center mb-4">
                        <span className="material-symbols-outlined text-4xl text-slate-400">csv</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 font-medium">Arraste ou selecione seu arquivo (.xlsx, .csv, .xml)</p>
                    <label className="cursor-pointer group">
                        <span className="bg-slate-900 dark:bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold shadow-xl shadow-slate-900/10 dark:shadow-emerald-950/20 group-hover:scale-105 transition-transform inline-block">
                            Escolher Arquivo
                        </span>
                        <input type="file" accept=".xlsx, .xls, .csv, .xml" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={loading} />
                    </label>
                    {file && (
                        <div className="mt-6 flex items-center gap-3 text-sm font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-700 px-5 py-2.5 rounded-full border border-slate-200 dark:border-slate-600 shadow-sm animate-in zoom-in-90">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                            {file.name}
                        </div>
                    )}
                </div>

                <div className="mt-8 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 -mx-8 -mb-8 p-6 border-t border-slate-200 dark:border-slate-800 rounded-b-2xl">
                    <div className="flex items-center gap-2">
                        {webhookUrl ?
                            <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1.5 rounded-full">
                                <span className="material-symbols-outlined text-sm">verified_user</span> Loja Conectada
                            </span> :
                            <span className="text-slate-400 text-xs italic">* Informe o código para iniciar</span>
                        }
                    </div>

                    <div className="flex gap-3">
                        {loading && !isPaused ? (
                            <button onClick={handlePause} className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2">
                                <span className="material-symbols-outlined">pause</span> Pausar
                            </button>
                        ) : loading && isPaused ? (
                            <button onClick={resumeImport} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all flex items-center gap-2">
                                <span className="material-symbols-outlined">play_arrow</span> Retomar
                            </button>
                        ) : (
                            <button onClick={handleStartProcess} disabled={!file || !!hasPendingImport} className="px-10 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black shadow-2xl shadow-slate-900/20 dark:shadow-white/10 hover:opacity-90 disabled:opacity-30 disabled:hover:scale-100 flex items-center gap-2 transition-all transform active:scale-95 group">
                                <span className="material-symbols-outlined group-hover:rotate-12 transition-transform">bolt</span>
                                INICIAR ENVIO
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Barra de Progresso Realista */}
            {(loading || progress > 0) && (
                <div className="space-y-2 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm animate-in slide-up-4 duration-300">
                    <div className="flex justify-between items-center mb-1">
                        <div>
                            <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Status do Envio</span>
                            <p className="text-[10px] text-slate-400">{currentIndex} de {itemsToProcess.length + stats.skipped} processados</p>
                        </div>
                        <span className="text-2xl font-black text-emerald-500 italic">{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-4 rounded-full overflow-hidden p-1 shadow-inner border border-slate-200 dark:border-slate-700">
                        <div
                            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-700 ease-out relative"
                            style={{ width: `${progress}%` }}
                        >
                            <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-4">
                        <div className="bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900/30 text-center">
                            <p className="text-[10px] text-emerald-600 font-bold uppercase">Sucesso</p>
                            <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{stats.success}</p>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg border border-blue-100 dark:border-blue-900/30 text-center">
                            <p className="text-[10px] text-blue-600 font-bold uppercase">Pulados</p>
                            <p className="text-lg font-black text-blue-700 dark:text-blue-400">{stats.skipped}</p>
                        </div>
                        <div className="bg-rose-50 dark:bg-rose-950/20 p-2 rounded-lg border border-rose-100 dark:border-rose-900/30 text-center">
                            <p className="text-[10px] text-rose-600 font-bold uppercase">Erros</p>
                            <p className="text-lg font-black text-rose-700 dark:text-rose-400">{stats.errors}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Console de Logs Estilo Hacker */}
            <div className="relative group">
                <div className="absolute -top-3 left-4 bg-slate-900 text-emerald-500 px-3 py-0.5 rounded-full text-[10px] font-bold border border-emerald-900/50 z-10">STDOUT / ACTIVITY_LOG</div>
                <div className="bg-slate-950 text-emerald-500 rounded-2xl p-6 h-72 overflow-y-auto font-mono text-[11px] border border-slate-800 shadow-2xl custom-scrollbar-terminal">
                    {logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-700/50">
                            <span className="material-symbols-outlined text-5xl mb-3 opacity-10 animate-pulse">terminal</span>
                            <p className="font-bold tracking-widest uppercase text-xs">Waiting for input signal...</p>
                        </div>
                    ) : logs.map((log, i) => (
                        <div key={i} className={`flex gap-3 py-1.5 border-b border-slate-900/50 hover:bg-white/5 transition-colors ${log.includes('❌') ? 'text-rose-400' : ''} ${log.includes('⚠️') ? 'text-amber-400' : ''} ${log.includes('✅') ? 'text-emerald-400' : ''} ${log.includes('🚀') ? 'text-blue-400 font-bold' : ''}`}>
                            <span className="text-slate-600 opacity-50">[{i + 1}]</span>
                            <span className="opacity-90">{log}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- MODAL DE CÓDIGO --- */}
            {showAccessModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden p-8 animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
                        <div className="text-center mb-8">
                            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4 transform rotate-3">
                                <span className="material-symbols-outlined text-primary text-3xl font-bold">lock_open</span>
                            </div>
                            <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Security Gate</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Informe o código da loja para autenticar.</p>
                        </div>

                        <div className="space-y-6">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="••••••••"
                                    className="w-full px-4 py-4 rounded-xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center text-xl font-black tracking-[0.5em] uppercase focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all placeholder:tracking-normal placeholder:opacity-30"
                                    value={accessCode}
                                    onChange={e => setAccessCode(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && verifyAccessCode()}
                                    autoFocus
                                />
                            </div>
                            <button
                                onClick={verifyAccessCode}
                                disabled={verifyingCode || !accessCode}
                                className="w-full py-4 bg-primary text-white font-black rounded-xl hover:opacity-90 disabled:opacity-50 shadow-xl shadow-primary/30 active:scale-95 transition-all text-xs uppercase tracking-widest"
                            >
                                {verifyingCode ? 'Processing...' : 'Authorize Access'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar-terminal::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar-terminal::-webkit-scrollbar-track { background: #020617; }
                .custom-scrollbar-terminal::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; border: 2px solid #020617; }
                .custom-scrollbar-terminal::-webkit-scrollbar-thumb:hover { background: #334155; }
            `}</style>
        </div>
    );
};

export default ImportReturns;