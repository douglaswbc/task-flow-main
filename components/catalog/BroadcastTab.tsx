import React, { useState, useEffect, useRef } from 'react';
import { Send, Image as ImageIcon, FileText, Video, Users, CheckCircle2, AlertCircle, Loader2, Pause, Square, Play } from 'lucide-react';
import { evolutionApi, WhatsAppInstance } from '../../services/evolutionApi';
import { WhatsAppGroup } from '../../types';
import toast from 'react-hot-toast';

interface BroadcastTabProps {
    groups: WhatsAppGroup[];
}

interface BroadcastState {
    selectedInstance: string;
    message: string;
    targetType: 'all' | 'selected';
    selectedGroups: string[];
    delay: number;
    currentProgress: number;
    remainingGroups: string[];
    isPaused: boolean;
}

interface BroadcastResult {
    groupName: string;
    whatsappId: string;
    status: 'success' | 'error';
    error?: string;
    timestamp: string;
}

const STORAGE_KEY = 'whatsapp_broadcast_state';
const RESULTS_KEY = 'whatsapp_broadcast_results';

const BroadcastTab: React.FC<BroadcastTabProps> = ({ groups }) => {
    const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
    const [selectedInstance, setSelectedInstance] = useState<string>('');
    const [targetType, setTargetType] = useState<'all' | 'selected'>('all');
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [message, setMessage] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [delay, setDelay] = useState(5); // Padrão 5 segundos

    // Controle de Envio
    const [isSending, setIsSending] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [remainingTargets, setRemainingTargets] = useState<WhatsAppGroup[]>([]);
    const [results, setResults] = useState<BroadcastResult[]>([]);

    const stopRef = useRef(false);
    const pauseRef = useRef(false);

    useEffect(() => {
        loadInstances();
        loadSavedState();
    }, []);

    useEffect(() => {
        if (file) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setPreviewUrl(null);
        }
    }, [file]);

    // Valida a instância selecionada quando a lista de instâncias muda
    useEffect(() => {
        if (instances.length > 0) {
            const isStillConnected = instances.some(i => i.instance_name === selectedInstance);
            if (!isStillConnected) {
                setSelectedInstance(instances[0].instance_name);
            }
        } else {
            setSelectedInstance('');
        }
    }, [instances]);


    const loadInstances = async () => {
        try {
            const data = await evolutionApi.instances.list();
            const openInstances = data.filter(i => i.connection_status === 'open');
            setInstances(openInstances);
        } catch (error) {
            console.error('Erro ao carregar instâncias:', error);
        }
    };


    const loadSavedState = () => {
        const saved = localStorage.getItem(STORAGE_KEY);
        const savedResults = localStorage.getItem(RESULTS_KEY);

        if (savedResults) {
            try {
                setResults(JSON.parse(savedResults));
            } catch (e) {
                console.error('Erro ao carregar resultados salvos:', e);
            }
        }

        if (saved) {
            try {
                const state: BroadcastState = JSON.parse(saved);
                setSelectedInstance(state.selectedInstance);
                setMessage(state.message);
                setTargetType(state.targetType);
                setSelectedGroups(state.selectedGroups);
                setDelay(state.delay);

                if (state.remainingGroups.length > 0) {
                    const remaining = groups.filter(g => state.remainingGroups.includes(g.whatsapp_id));
                    setRemainingTargets(remaining);
                    setProgress({
                        current: state.currentProgress,
                        total: state.currentProgress + state.remainingGroups.length
                    });
                    setIsPaused(true);
                    pauseRef.current = true;
                }
            } catch (e) {
                console.error('Erro ao carregar estado salvo:', e);
            }
        }
    };

    const saveState = (currentRemaining: WhatsAppGroup[], currentProgressValue: number, currentResults: BroadcastResult[]) => {
        const state: BroadcastState = {
            selectedInstance,
            message,
            targetType,
            selectedGroups,
            delay,
            currentProgress: currentProgressValue,
            remainingGroups: currentRemaining.map(g => g.whatsapp_id),
            isPaused: pauseRef.current
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        localStorage.setItem(RESULTS_KEY, JSON.stringify(currentResults));
    };

    const clearSavedState = () => {
        localStorage.removeItem(STORAGE_KEY);
        // Não removemos o RESULTS_KEY aqui para permitir exportação após término
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64 = reader.result?.toString().split(',')[1];
                resolve(base64 || '');
            };
            reader.onerror = error => reject(error);
        });
    };

    const exportToCSV = () => {
        if (results.length === 0) {
            toast.error('Não há resultados para exportar');
            return;
        }

        const headers = ['Grupo', 'WhatsApp ID', 'Status', 'Erro', 'Data/Hora'];
        const csvRows = [
            headers.join(','),
            ...results.map(r => [
                `"${r.groupName}"`,
                `"${r.whatsappId}"`,
                r.status === 'success' ? 'Sucesso' : 'Erro',
                `"${r.error || ''}"`,
                r.timestamp
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `resumo_transmissao_${new Date().getTime()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Resumo exportado com sucesso!');
    };

    const processQueue = async (targets: WhatsAppGroup[], startFromIdx: number) => {
        setIsSending(true);
        stopRef.current = false;

        let mediaBase64 = '';
        if (file) {
            mediaBase64 = await fileToBase64(file);
        }

        const queue = [...targets];
        const newResults = [...results];

        for (let i = 0; i < queue.length; i++) {
            if (stopRef.current) break;

            while (pauseRef.current) {
                await new Promise(resolve => setTimeout(resolve, 500));
                if (stopRef.current) break;
            }
            if (stopRef.current) break;

            const target = queue[i];
            const currentIdx = startFromIdx + i + 1;
            setProgress(prev => ({ ...prev, current: currentIdx }));

            let result: BroadcastResult = {
                groupName: target.name,
                whatsappId: target.whatsapp_id,
                status: 'success',
                timestamp: new Date().toLocaleString()
            };

            try {
                if (file) {
                    await evolutionApi.messages.sendMedia(
                        selectedInstance,
                        target.whatsapp_id,
                        mediaBase64,
                        file.name,
                        message
                    );
                } else {
                    await evolutionApi.messages.send(
                        selectedInstance,
                        target.whatsapp_id,
                        message
                    );
                }
            } catch (err: any) {
                console.error(`Erro ao enviar para ${target.name}:`, err);
                result.status = 'error';
                result.error = err.message || 'Erro desconhecido';
            }

            newResults.push(result);
            setResults([...newResults]);

            const newRemaining = queue.slice(i + 1);
            setRemainingTargets(newRemaining);
            saveState(newRemaining, currentIdx, newResults);

            if (i < queue.length - 1 && !stopRef.current) {
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
        }

        if (!stopRef.current && !pauseRef.current) {
            toast.success('Transmissão concluída!');
            clearSavedState();
            setRemainingTargets([]);
            setIsSending(false);
            setProgress({ current: 0, total: 0 });
        }
    };

    const handleStart = async () => {
        if (!selectedInstance) {
            toast.error('Selecione uma instância conectada');
            return;
        }

        const targets = targetType === 'all'
            ? groups
            : groups.filter(g => selectedGroups.includes(g.whatsapp_id));

        if (targets.length === 0) {
            toast.error('Selecione ao menos um grupo de destino');
            return;
        }

        if (!message && !file) {
            toast.error('Digite uma mensagem ou selecione um arquivo');
            return;
        }

        localStorage.removeItem(RESULTS_KEY);
        setResults([]);
        setProgress({ current: 0, total: targets.length });
        setRemainingTargets(targets);
        processQueue(targets, 0);
    };

    const handleResume = () => {
        pauseRef.current = false;
        setIsPaused(false);
        if (!isSending) {
            processQueue(remainingTargets, progress.current);
        }
    };

    const handlePause = () => {
        pauseRef.current = true;
        setIsPaused(true);
        saveState(remainingTargets, progress.current, results);
        toast.secondary('Envio pausado');
    };

    const handleStop = () => {
        stopRef.current = true;
        pauseRef.current = false;
        setIsSending(false);
        setIsPaused(false);
        clearSavedState();
        setRemainingTargets([]);
        setProgress({ current: 0, total: 0 });
        toast.error('Transmissão interrompida');
    };

    const toggleGroup = (groupId: string) => {
        setSelectedGroups(prev =>
            prev.includes(groupId)
                ? prev.filter(id => id !== groupId)
                : [...prev, groupId]
        );
    };

    const totalToSelect = targetType === 'all' ? groups.length : selectedGroups.length;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {remainingTargets.length > 0 && !isSending && isPaused && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                        <div>
                            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Transmissão Pendente</p>
                            <p className="text-xs text-amber-600 dark:text-amber-400">Você tem {remainingTargets.length} grupos restantes na fila.</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleStop} className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs font-bold hover:bg-red-200 transition-all">Excluir Fila</button>
                        <button onClick={handleResume} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-all">Retomar Agora</button>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm overflow-hidden relative">
                <div className="flex flex-col md:flex-row gap-8">
                    {/* Configurações */}
                    <div className="flex-1 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    1. Instância
                                </label>
                                <select
                                    value={selectedInstance}
                                    onChange={(e) => setSelectedInstance(e.target.value)}
                                    disabled={isSending}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 transition-all font-medium text-sm disabled:opacity-50"
                                >
                                    {instances.length === 0 ? (
                                        <option value="">Nenhuma conectada</option>
                                    ) : (
                                        instances.map(inst => (
                                            <option key={inst.id} value={inst.instance_name}>
                                                {inst.instance_name}
                                            </option>
                                        ))
                                    )}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    Delay (segundos)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="60"
                                    value={delay}
                                    onChange={(e) => setDelay(parseInt(e.target.value))}
                                    disabled={isSending}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 transition-all font-medium text-sm disabled:opacity-50"
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                                    2. Destino ({totalToSelect} selecionados)
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setTargetType('all')}
                                    disabled={isSending}
                                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${targetType === 'all'
                                        ? 'border-primary bg-primary/5 text-primary'
                                        : 'border-slate-100 dark:border-slate-800 text-slate-500'
                                        } disabled:opacity-50`}
                                >
                                    <Users className="w-4 h-4" />
                                    <span className="font-bold text-sm">Todos os Grupos</span>
                                </button>
                                <button
                                    onClick={() => setTargetType('selected')}
                                    disabled={isSending}
                                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${targetType === 'selected'
                                        ? 'border-primary bg-primary/5 text-primary'
                                        : 'border-slate-100 dark:border-slate-800 text-slate-500'
                                        } disabled:opacity-50`}
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span className="font-bold text-sm">Escolher</span>
                                </button>
                            </div>
                        </div>

                        {targetType === 'selected' && !isSending && (
                            <div className="space-y-2 max-h-48 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                {groups.map(group => (
                                    <div
                                        key={group.whatsapp_id}
                                        onClick={() => toggleGroup(group.whatsapp_id)}
                                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${selectedGroups.includes(group.whatsapp_id)
                                            ? 'bg-primary/10 text-primary'
                                            : 'hover:bg-slate-200 dark:hover:bg-slate-700'
                                            }`}
                                    >
                                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${selectedGroups.includes(group.whatsapp_id) ? 'bg-primary border-primary' : 'border-slate-300'
                                            }`}>
                                            {selectedGroups.includes(group.whatsapp_id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                                        </div>
                                        <span className="text-sm font-medium truncate">{group.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Composição */}
                    <div className="flex-1 space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                3. Mensagem / Legenda
                            </label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                disabled={isSending && !isPaused}
                                placeholder="Digite aqui sua mensagem..."
                                className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary/20 transition-all font-medium min-h-[100px] resize-none disabled:opacity-50"
                            />
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                                    4. Mídia (Opcional)
                                </label>
                                <div className="relative group">
                                    <input
                                        type="file"
                                        onChange={handleFileChange}
                                        className="hidden"
                                        id="broadcast-file"
                                        disabled={isSending}
                                        accept="image/*,application/pdf,video/*"
                                    />
                                    <label
                                        htmlFor="broadcast-file"
                                        className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-4 cursor-pointer transition-all ${file
                                            ? 'border-primary bg-primary/5'
                                            : 'border-slate-200 dark:border-slate-800 hover:border-primary/50 hover:bg-slate-50'
                                            } ${isSending ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {file ? (
                                            <div className="flex flex-col items-center text-center">
                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate max-w-[150px]">
                                                    {file.name}
                                                </span>
                                                {!isSending && (
                                                    <button
                                                        onClick={(e) => { e.preventDefault(); setFile(null); }}
                                                        className="mt-1 text-[10px] text-red-500 font-bold hover:underline"
                                                    >
                                                        Remover
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-slate-400">
                                                <ImageIcon className="w-4 h-4" />
                                                <span className="text-xs font-bold">Anexar Mídia</span>
                                            </div>
                                        )}
                                    </label>
                                </div>
                            </div>

                            {/* Preview Area */}
                            {previewUrl && (
                                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 border border-slate-100 dark:border-slate-700 animate-in zoom-in duration-300">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Preview do Arquivo</p>
                                    <div className="flex items-center justify-center bg-white dark:bg-slate-900 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 min-h-[100px]">
                                        {file?.type.startsWith('image/') ? (
                                            <img src={previewUrl} alt="Preview" className="max-h-40 object-contain" />
                                        ) : file?.type.startsWith('video/') ? (
                                            <video src={previewUrl} controls className="max-h-40 w-full" />
                                        ) : (
                                            <div className="flex flex-col items-center p-4">
                                                <FileText className="w-8 h-8 text-primary mb-2" />
                                                <span className="text-xs font-bold text-slate-500">{file?.name}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-4">
                    {(isSending || isPaused || results.length > 0) && progress.total > 0 && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        {isSending && !isPaused ? <Loader2 className="w-3 h-3 animate-spin text-primary" /> : <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                                        {isSending && !isPaused ? 'Enviando...' : isPaused ? 'Pausado' : 'Transmissão Finalizada'}
                                    </span>
                                    <span className="text-xs font-black text-primary">
                                        {progress.current} de {progress.total}
                                    </span>
                                </div>
                                <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary transition-all duration-300"
                                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                    />
                                </div>
                            </div>

                            {!isSending && results.length > 0 && (
                                <div className="flex justify-center">
                                    <button
                                        onClick={exportToCSV}
                                        className="flex items-center gap-2 px-6 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-xl text-sm font-bold hover:bg-slate-900 transition-all shadow-md"
                                    >
                                        <FileText className="w-4 h-4" />
                                        EXPORTAR RESUMO (CSV)
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-3">
                        {!isSending && !isPaused ? (
                            <button
                                onClick={handleStart}
                                disabled={instances.length === 0}
                                className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-black text-lg bg-primary text-white shadow-lg shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                            >
                                <Send className="w-6 h-6" />
                                INICIAR TRANSMISSÃO
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={handleStop}
                                    className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-black text-lg bg-red-500 text-white shadow-lg shadow-red-500/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
                                >
                                    <Square className="w-5 h-5 fill-current" />
                                    PARAR
                                </button>

                                {isPaused ? (
                                    <button
                                        onClick={handleResume}
                                        className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-black text-lg bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
                                    >
                                        <Play className="w-6 h-6 fill-current" />
                                        RETOMAR
                                    </button>
                                ) : (
                                    <button
                                        onClick={handlePause}
                                        className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-black text-lg bg-amber-500 text-white shadow-lg shadow-amber-500/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
                                    >
                                        <Pause className="w-6 h-6 fill-current" />
                                        PAUSAR
                                    </button>
                                )}
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-2 justify-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        <AlertCircle className="w-3 h-3" />
                        Delay atual: {delay}s entre cada grupo.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BroadcastTab;
