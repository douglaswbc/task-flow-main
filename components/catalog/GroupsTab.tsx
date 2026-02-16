import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { evolutionApi } from '../../services/evolutionApi';
import toast from 'react-hot-toast';
import {
    Download,
    Plus,
    Trash2,
    Edit,
    CheckCircle,
    XCircle,
    X,
    Save,
    MessageSquare
} from 'lucide-react';
import { WhatsAppGroup } from '../../types';
import { normalizeContact } from '../../utils/catalogUtils';

interface GroupsTabProps {
    groups: WhatsAppGroup[];
    onUpdate: () => void;
}

const GroupsTab: React.FC<GroupsTabProps> = ({ groups, onUpdate }) => {
    const [showGroupDialog, setShowGroupDialog] = useState(false);
    const [editingGroup, setEditingGroup] = useState<WhatsAppGroup | null>(null);
    const [groupForm, setGroupForm] = useState({ name: '', whatsapp_id: '', is_active: true });

    // Import State
    const [showInstanceSelector, setShowInstanceSelector] = useState(false);
    const [instances, setInstances] = useState<any[]>([]);
    const [loadingImport, setLoadingImport] = useState(false);

    // Pagination & Search
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const itemsPerPage = 20;

    // Groups Pagination calculations
    const filteredGroups = groups.filter(group =>
        group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.whatsapp_id.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);
    const paginatedGroups = filteredGroups.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );
    const allCurrentPageSelected = paginatedGroups.length > 0 &&
        paginatedGroups.every(g => selectedGroupIds.has(g.id));

    // WhatsApp Groups CRUD
    const handleSaveGroup = async () => {
        try {
            // Detecta se é contato (não é grupo)
            const isContact = !groupForm.whatsapp_id.includes('@g.us');

            // Normaliza o whatsapp_id se for contato
            let finalWhatsappId = groupForm.whatsapp_id;
            if (isContact) {
                finalWhatsappId = normalizeContact(groupForm.whatsapp_id);
                if (!finalWhatsappId) {
                    toast.error('Número de contato inválido. Use o formato: DDD + número (ex: 11912345678)');
                    return;
                }
            }

            const dataToSave = {
                ...groupForm,
                whatsapp_id: finalWhatsappId
            };

            if (editingGroup) {
                const { error } = await supabase
                    .from('whatsapp_groups')
                    .update(dataToSave)
                    .eq('id', editingGroup.id);
                if (error) throw error;
                toast.success(isContact ? 'Contato atualizado com sucesso!' : 'Grupo atualizado com sucesso!');
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    toast.error('Usuário não autenticado');
                    return;
                }

                const { error } = await supabase
                    .from('whatsapp_groups')
                    .insert([{ ...dataToSave, user_id: user.id }]);
                if (error) throw error;
                toast.success(isContact ? 'Contato criado com sucesso!' : 'Grupo criado com sucesso!');
            }
            setShowGroupDialog(false);
            setEditingGroup(null);
            setGroupForm({ name: '', whatsapp_id: '', is_active: true });
            onUpdate();
        } catch (error: any) {
            toast.error('Erro ao salvar: ' + error.message);
        }
    };

    const handleStartImport = async () => {
        try {
            setLoadingImport(true);
            const instancesList = await evolutionApi.instances.list();
            const connectedInstances = instancesList.filter(inst => inst.connection_status === 'open');

            if (connectedInstances.length === 0) {
                toast.error('Nenhuma instância do WhatsApp conectada. Conecte uma instância primeiro.');
                return;
            }

            setInstances(connectedInstances);
            setShowInstanceSelector(true);
        } catch (error: any) {
            toast.error('Erro ao carregar instâncias: ' + error.message);
        } finally {
            setLoadingImport(false);
        }
    };

    const handleSelectInstance = async (instanceName: string) => {
        try {
            setLoadingImport(true);
            setShowInstanceSelector(false);

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                toast.error('Sessão expirada. Faça login novamente.');
                return;
            }

            const response = await fetch(
                `${supabase.supabaseUrl}/functions/v1/import-whatsapp-groups`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ instance_name: instanceName })
                }
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Erro ao importar');
            }

            const result = await response.json();

            const message = `✅ Importação concluída!\n` +
                `• ${result.imported} novos itens importados\n` +
                `• ${result.skipped} já existentes\n` +
                `• Total: ${result.groups} grupos + ${result.contacts} contatos`;

            toast.success(message, { duration: 5000 });
            onUpdate();
        } catch (error: any) {
            toast.error('Erro ao importar: ' + error.message);
        } finally {
            setLoadingImport(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Grupos e Contatos</h3>
                <div className="flex gap-2">
                    <button
                        onClick={handleStartImport}
                        disabled={loadingImport}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
                    >
                        <Download className="w-4 h-4" />
                        {loadingImport ? 'Carregando...' : 'Importar do WhatsApp'}
                    </button>
                    <button
                        onClick={() => {
                            setEditingGroup(null);
                            setGroupForm({ name: '', whatsapp_id: '', is_active: true });
                            setShowGroupDialog(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white font-bold rounded-xl hover:opacity-90 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        Novo Item
                    </button>
                </div>
            </div>

            {/* Search and Bulk Actions */}
            <div className="flex gap-3 items-center">
                <input
                    type="text"
                    placeholder="Buscar por nome ou WhatsApp ID..."
                    value={searchQuery}
                    onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                    }}
                    className="flex-1 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:ring-2 focus:ring-primary/20 outline-none text-sm"
                />
                {selectedGroupIds.size > 0 && (
                    <button
                        onClick={async () => {
                            if (!confirm(`Excluir ${selectedGroupIds.size} grupo(s)?`)) return;
                            try {
                                const { error } = await supabase.from('whatsapp_groups').delete().in('id', Array.from(selectedGroupIds));
                                if (error) throw error;
                                toast.success(`${selectedGroupIds.size} excluído(s)!`);
                                setSelectedGroupIds(new Set());
                                onUpdate();
                            } catch (error: any) {
                                toast.error('Erro: ' + error.message);
                            }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-bold rounded-xl hover:opacity-90"
                    >
                        <Trash2 className="w-4 h-4" />
                        Excluir ({selectedGroupIds.size})
                    </button>
                )}
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden">
                <table className="w-full">
                    <thead className="bg-slate-50 dark:bg-slate-950">
                        <tr>
                            <th className="px-6 py-4 text-left w-12">
                                <input
                                    type="checkbox"
                                    checked={allCurrentPageSelected}
                                    onChange={() => {
                                        const currentIds = paginatedGroups.map(g => g.id);
                                        if (allCurrentPageSelected) {
                                            setSelectedGroupIds(prev => {
                                                const newSet = new Set(prev);
                                                currentIds.forEach(id => newSet.delete(id));
                                                return newSet;
                                            });
                                        } else {
                                            setSelectedGroupIds(prev => new Set([...prev, ...currentIds]));
                                        }
                                    }}
                                    className="w-4 h-4 rounded border-slate-300"
                                />
                            </th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Nome</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">WhatsApp ID (JID)</th>
                            <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {paginatedGroups.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                                    {searchQuery ? 'Nenhum grupo encontrado.' : 'Nenhum grupo cadastrado.'}
                                </td>
                            </tr>
                        ) : (
                            paginatedGroups.map((group) => (
                                <tr key={group.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedGroupIds.has(group.id)}
                                            onChange={() => {
                                                setSelectedGroupIds(prev => {
                                                    const newSet = new Set(prev);
                                                    if (newSet.has(group.id)) {
                                                        newSet.delete(group.id);
                                                    } else {
                                                        newSet.add(group.id);
                                                    }
                                                    return newSet;
                                                });
                                            }}
                                            className="w-4 h-4 rounded border-slate-300"
                                        />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium text-slate-900 dark:text-white">{group.name}</p>
                                            {group.instance_name && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
                                                    🤖 {group.instance_name}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 font-mono">{group.whatsapp_id}</td>
                                    <td className="px-6 py-4">
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const { error } = await supabase.from('whatsapp_groups').update({ is_active: !group.is_active }).eq('id', group.id);
                                                    if (error) throw error;
                                                    toast.success(`Grupo ${!group.is_active ? 'ativado' : 'desativado'}!`);
                                                    onUpdate();
                                                } catch (error: any) {
                                                    toast.error('Erro: ' + error.message);
                                                }
                                            }}
                                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${group.is_active
                                                ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                }`}
                                        >
                                            {group.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                            {group.is_active ? 'Ativo' : 'Inativo'}
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button
                                            onClick={() => {
                                                setEditingGroup(group);
                                                setGroupForm({ name: group.name, whatsapp_id: group.whatsapp_id, is_active: group.is_active });
                                                setShowGroupDialog(true);
                                            }}
                                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 rounded-lg hover:opacity-80"
                                        >
                                            <Edit className="w-3 h-3" />
                                            Editar
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!confirm('Excluir este grupo?')) return;
                                                try {
                                                    const { error } = await supabase.from('whatsapp_groups').delete().eq('id', group.id);
                                                    if (error) throw error;
                                                    toast.success('Grupo excluído!');
                                                    onUpdate();
                                                } catch (error: any) {
                                                    toast.error('Erro: ' + error.message);
                                                }
                                            }}
                                            className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-lg hover:opacity-80"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                            Excluir
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                        <div className="text-sm text-slate-600 dark:text-slate-400">
                            Página {currentPage} de {totalPages} • {filteredGroups.length} grupo(s)
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm disabled:opacity-50"
                            >
                                Primeira
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm disabled:opacity-50"
                            >
                                Anterior
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm disabled:opacity-50"
                            >
                                Próxima
                            </button>
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm disabled:opacity-50"
                            >
                                Última
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Group Dialog */}
            {showGroupDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full space-y-6 shadow-2xl">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                                {editingGroup ? 'Editar Item' : 'Novo Item'}
                            </h3>
                            <button
                                onClick={() => setShowGroupDialog(false)}
                                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Nome</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                                    value={groupForm.name}
                                    onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                                    placeholder="Ex: Fornecedor Principal"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">WhatsApp ID</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-mono"
                                    value={groupForm.whatsapp_id}
                                    onChange={(e) => setGroupForm({ ...groupForm, whatsapp_id: e.target.value })}
                                    placeholder="Grupo: 5511999999999@g.us | Contato: 11912345678"
                                />
                                <p className="text-xs text-slate-500 ml-1">
                                    Contatos serão normalizados automaticamente
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="group-active"
                                    checked={groupForm.is_active}
                                    onChange={(e) => setGroupForm({ ...groupForm, is_active: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary"
                                />
                                <label htmlFor="group-active" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Grupo Ativo
                                </label>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowGroupDialog(false)}
                                className="flex-1 px-4 py-3 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl hover:opacity-80 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveGroup}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white font-bold rounded-xl hover:opacity-90 transition-all"
                            >
                                <Save className="w-4 h-4" />
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Instance Selector Dialog */}
            {showInstanceSelector && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full space-y-6 shadow-2xl">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                                Selecione a Instância
                            </h3>
                            <button
                                onClick={() => setShowInstanceSelector(false)}
                                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-3 max-h-96 overflow-y-auto">
                            {instances.map((instance) => (
                                <button
                                    key={instance.id}
                                    onClick={() => handleSelectInstance(instance.instance_name)}
                                    disabled={loadingImport}
                                    className="w-full p-4 bg-slate-50 dark:bg-slate-950 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-left disabled:opacity-50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center">
                                            <MessageSquare className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-bold text-slate-900 dark:text-white">
                                                {instance.instance_name}
                                            </p>
                                            <p className="text-sm text-slate-500">
                                                {instance.phone_number || 'Sem número'}
                                            </p>
                                        </div>
                                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GroupsTab;
