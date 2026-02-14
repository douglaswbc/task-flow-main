import React, { useState, useEffect } from 'react';
import { evolutionApi } from '../services/evolutionApi';
import { WhatsAppInstance } from '../types';
import { Smartphone, Plus, QrCode, Power, PowerOff, RefreshCw, Trash2, AlertCircle } from 'lucide-react';

export default function Instances() {
    const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showQRModal, setShowQRModal] = useState(false);
    const [newInstanceName, setNewInstanceName] = useState('');
    const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
    const [qrCode, setQrCode] = useState('');
    const [error, setError] = useState('');

    // Carrega instâncias ao montar o componente
    useEffect(() => {
        loadInstances();
    }, []);

    // Atualiza status das instâncias a cada 5 segundos
    useEffect(() => {
        const interval = setInterval(() => {
            loadInstances();
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    const loadInstances = async () => {
        try {
            const data = await evolutionApi.instances.list();
            setInstances(data);
        } catch (err: any) {
            console.error('Erro ao carregar instâncias:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateInstance = async () => {
        if (!newInstanceName.trim()) {
            setError('Por favor, insira um nome para a instância');
            return;
        }

        try {
            setLoading(true);
            await evolutionApi.instances.create(newInstanceName);
            setNewInstanceName('');
            setShowCreateModal(false);
            await loadInstances();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async (instance: WhatsAppInstance) => {
        try {
            setLoading(true);
            const qr = await evolutionApi.instances.connect(instance.instance_name);
            setQrCode(qr);
            setSelectedInstance(instance);
            setShowQRModal(true);

            // Verifica status a cada 3 segundos
            const checkInterval = setInterval(async () => {
                const status = await evolutionApi.instances.checkStatus(instance.instance_name);
                if (status === 'open') {
                    clearInterval(checkInterval);
                    setShowQRModal(false);
                    await loadInstances();
                }
            }, 3000);

            // Para de verificar após 2 minutos
            setTimeout(() => clearInterval(checkInterval), 120000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async (instance: WhatsAppInstance) => {
        if (!confirm(`Deseja realmente desconectar a instância "${instance.instance_name}"?`)) {
            return;
        }

        try {
            setLoading(true);
            await evolutionApi.instances.logout(instance.instance_name);
            await loadInstances();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRestart = async (instance: WhatsAppInstance) => {
        try {
            setLoading(true);
            await evolutionApi.instances.restart(instance.instance_name);
            await loadInstances();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (instance: WhatsAppInstance) => {
        if (!confirm(`Deseja realmente excluir a instância "${instance.instance_name}"? Esta ação não pode ser desfeita.`)) {
            return;
        }

        try {
            setLoading(true);
            await evolutionApi.instances.delete(instance.instance_name);
            await loadInstances();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'open':
                return 'bg-green-100 text-green-800';
            case 'connecting':
                return 'bg-yellow-100 text-yellow-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'open':
                return 'Conectado';
            case 'connecting':
                return 'Conectando...';
            default:
                return 'Desconectado';
        }
    };

    return (
        <div className="p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Instâncias WhatsApp</h1>
                    <p className="text-gray-600 mt-1">Gerencie suas conexões com o WhatsApp via Evolution API</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus size={20} />
                    Nova Instância
                </button>
            </div>

            {/* Mensagem de erro */}
            {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                    <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
                    <div>
                        <p className="text-red-800 font-medium">Erro</p>
                        <p className="text-red-600 text-sm">{error}</p>
                    </div>
                    <button onClick={() => setError('')} className="ml-auto text-red-600 hover:text-red-800">
                        ×
                    </button>
                </div>
            )}

            {/* Lista de instâncias */}
            {loading && instances.length === 0 ? (
                <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-gray-600 mt-4">Carregando instâncias...</p>
                </div>
            ) : instances.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <Smartphone size={48} className="mx-auto text-gray-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma instância criada</h3>
                    <p className="text-gray-600 mb-4">Crie sua primeira instância para começar a usar o WhatsApp</p>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                    >
                        <Plus size={20} />
                        Criar Instância
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {instances.map((instance) => (
                        <div key={instance.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow">
                            {/* Cabeçalho do card */}
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    {instance.profile_pic_url ? (
                                        <img src={instance.profile_pic_url} alt="" className="w-12 h-12 rounded-full" />
                                    ) : (
                                        <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                                            <Smartphone size={24} className="text-gray-500" />
                                        </div>
                                    )}
                                    <div>
                                        <h3 className="font-semibold text-gray-900">{instance.instance_name}</h3>
                                        <p className="text-sm text-gray-500">{instance.phone_number || 'Não conectado'}</p>
                                    </div>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(instance.connection_status)}`}>
                                    {getStatusText(instance.connection_status)}
                                </span>
                            </div>

                            {/* Ações */}
                            <div className="flex gap-2 mt-4">
                                {instance.connection_status === 'open' ? (
                                    <>
                                        <button
                                            onClick={() => handleDisconnect(instance)}
                                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                            title="Desconectar"
                                        >
                                            <PowerOff size={16} />
                                            Desconectar
                                        </button>
                                        <button
                                            onClick={() => handleRestart(instance)}
                                            className="px-3 py-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                                            title="Reiniciar"
                                        >
                                            <RefreshCw size={16} />
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => handleConnect(instance)}
                                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                                    >
                                        <QrCode size={16} />
                                        Conectar
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDelete(instance)}
                                    className="px-3 py-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
                                    title="Excluir"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de Criar Instância */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Nova Instância WhatsApp</h2>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Nome da Instância
                            </label>
                            <input
                                type="text"
                                value={newInstanceName}
                                onChange={(e) => setNewInstanceName(e.target.value)}
                                placeholder="Ex: WhatsApp Pessoal"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                autoFocus
                                onKeyPress={(e) => e.key === 'Enter' && handleCreateInstance()}
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                Será gerado: {newInstanceName ? `${newInstanceName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_').substring(0, 15)}_abc123` : 'exemplo_abc123'}
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setNewInstanceName('');
                                }}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateInstance}
                                disabled={loading}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {loading ? 'Criando...' : 'Criar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de QR Code */}
            {showQRModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md">
                        <h2 className="text-xl font-bold mb-4">Conectar WhatsApp</h2>
                        <p className="text-gray-600 mb-4">
                            Escaneie o QR Code abaixo com seu WhatsApp para conectar a instância "{selectedInstance?.instance_name}"
                        </p>
                        {qrCode ? (
                            <div className="flex justify-center mb-4">
                                <img src={qrCode} alt="QR Code" className="w-64 h-64" />
                            </div>
                        ) : (
                            <div className="flex justify-center mb-4">
                                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
                            </div>
                        )}
                        <button
                            onClick={() => {
                                setShowQRModal(false);
                                setQrCode('');
                                setSelectedInstance(null);
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
