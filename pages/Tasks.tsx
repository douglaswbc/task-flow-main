import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Tipagem para os itens da Checklist
interface ChecklistItem {
  title: string;
  is_completed: boolean;
}

// Tipagem baseada na tabela SQL atualizada
interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BACKLOG';
  origin: 'Manual' | 'Recorrente';
  is_high_priority: boolean;
  deadline: string | null;
  checklist: ChecklistItem[] | null;
  responsible_id: string | null;
  created_at: string;
}

// Mapeamento para exibir status em português
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Pendente', color: 'text-slate-600', bg: 'bg-slate-100' },
  IN_PROGRESS: { label: 'Em Andamento', color: 'text-blue-700', bg: 'bg-blue-100' },
  COMPLETED: { label: 'Concluído', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  BACKLOG: { label: 'Backlog', color: 'text-orange-700', bg: 'bg-orange-100' },
};

const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Estados do Modal e Formulário
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [bitrixUsers, setBitrixUsers] = useState<{ id: string; name: string; work_position: string }[]>([]);

  // Estado do formulário incluindo novos campos
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'PENDING' as Task['status'],
    is_high_priority: false,
    deadline: '',
    checklist: [] as ChecklistItem[],
    responsible_id: ''
  });

  // Estado auxiliar para adicionar itens na checklist
  const [newChecklistItem, setNewChecklistItem] = useState('');

  useEffect(() => {
    fetchTasks();
    fetchBitrixUsers();
  }, []);

  const fetchBitrixUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch('https://fkpxmqjvtrqzvcfhlcru.supabase.co/functions/v1/bitrix-users', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setBitrixUsers(data);
      }
    } catch (error) {
      console.error('Erro ao buscar usuários do Bitrix:', error);
    }
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data, count, error } = await supabase
        .from('tasks')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks(data || []);
      setTotal(count || 0);
    } catch (error) {
      console.error('Erro ao buscar tarefas:', error);
    } finally {
      setLoading(false);
    }
  };


  // --- AÇÕES DO FORMULÁRIO (CHECKLIST) ---
  const addChecklistItem = (e: React.KeyboardEvent | React.MouseEvent) => {
    // Se for evento de teclado, só aceita Enter
    if (e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') return;
    e.preventDefault();

    if (!newChecklistItem.trim()) return;

    setFormData(prev => ({
      ...prev,
      checklist: [...prev.checklist, { title: newChecklistItem, is_completed: false }]
    }));
    setNewChecklistItem('');
  };

  const removeChecklistItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      checklist: prev.checklist.filter((_, i) => i !== index)
    }));
  };

  // --- AÇÕES DO MODAL ---
  const openNewTaskModal = () => {
    setEditingTask(null);
    setFormData({
      title: '',
      description: '',
      status: 'PENDING',
      is_high_priority: false,
      deadline: '',
      checklist: [],
      responsible_id: ''
    });
    setNewChecklistItem('');
    setIsModalOpen(true);
  };

  const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      status: task.status,
      is_high_priority: task.is_high_priority,
      // Formata data para o input datetime-local (yyyy-MM-ddThh:mm) no horário local
      deadline: task.deadline ? (() => {
        const d = new Date(task.deadline);
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      })() : '',
      checklist: task.checklist || [],
      responsible_id: task.responsible_id || ''
    });
    setNewChecklistItem('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };

  // --- CRUD OPERATIONS ---
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return alert('O título é obrigatório.');

    try {
      setSaving(true);
      const { data: { user } } = await (supabase.auth as any).getUser();
      if (!user) return alert('Sessão inválida. Faça login novamente.');

      const payload = {
        title: formData.title,
        description: formData.description || null,
        status: formData.status,
        is_high_priority: formData.is_high_priority,
        origin: editingTask ? editingTask.origin : 'Manual',
        deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
        checklist: formData.checklist, // Supabase serializa JSONB automaticamente
        responsible_id: formData.responsible_id || null
      };

      let error;
      let data;

      if (editingTask) {
        // UPDATE
        const response = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', editingTask.id)
          .select()
          .single();
        error = response.error;
        data = response.data;

        if (!error && data) {
          setTasks(prev => prev.map(t => t.id === data.id ? data : t));
        }
      } else {
        // CREATE
        const response = await supabase
          .from('tasks')
          .insert({
            ...payload,
            user_id: user.id,
          })
          .select()
          .single();
        error = response.error;
        data = response.data;

        if (!error && data) {
          setTasks(prev => [data, ...prev]);
          setTotal(prev => prev + 1);

        }
      }

      if (error) throw error;
      closeModal();

    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      alert('Erro ao salvar tarefa: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta tarefa permanentemente?')) return;

    try {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
      setTasks(prev => prev.filter(task => task.id !== id));
      setTotal(prev => prev - 1);
    } catch (err: any) {
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const cycleStatus = async (task: Task) => {
    const statusOrder: Task['status'][] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BACKLOG'];
    const currentIndex = statusOrder.indexOf(task.status);
    const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];

    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: nextStatus })
        .eq('id', task.id);

      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: nextStatus } : t));
    } catch (err) {
      console.error('Erro ao ciclar status', err);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* HEADER DA PÁGINA */}
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Tarefas</h2>
            <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded text-xs font-bold">{total}</span>
          </div>
          <p className="text-slate-500 text-sm">Gerencie seu fluxo de trabalho pessoal e automático.</p>
        </div>

        <div className="flex gap-3">
          <button onClick={fetchTasks} className="px-4 py-2 text-sm font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
          <button onClick={openNewTaskModal} className="px-4 py-2 text-sm font-bold bg-primary text-white rounded-lg shadow-sm hover:opacity-90 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">add</span>
            Nova Tarefa
          </button>
        </div>
      </div>

      {/* TABELA DE TAREFAS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <th className="px-6 py-4 w-12"><input className="rounded border-slate-300 text-primary focus:ring-primary" type="checkbox" /></th>
              <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tarefa</th>
              <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-40">Status</th>
              <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-32">Prioridade</th>
              <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-48">Criada em</th>
              <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-32">Origem</th>
              <th className="px-6 py-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider w-24 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-400">Carregando tarefas...</td></tr>
            ) : tasks.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-400 italic">Nenhuma tarefa encontrada.</td></tr>
            ) : tasks.map((task) => (
              <tr key={task.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                <td className="px-6 py-4"><input className="rounded border-slate-300 text-primary focus:ring-primary" type="checkbox" /></td>

                {/* Título e Descrição */}
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span
                      className={`text-sm font-semibold text-slate-900 dark:text-slate-200 cursor-pointer hover:text-primary ${task.status === 'COMPLETED' ? 'line-through opacity-50' : ''}`}
                      onClick={() => openEditTaskModal(task)}
                    >
                      {task.title}
                    </span>
                    <div className="flex flex-col gap-1 mt-0.5">
                      {task.description && (
                        <span className="text-xs text-slate-400 truncate max-w-[200px]">{task.description}</span>
                      )}
                      {/* Indicadores Visuais na Tabela */}
                      <div className="flex gap-2">
                        {task.deadline && (
                          <span className="flex items-center gap-1 text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded w-fit">
                            <span className="material-symbols-outlined text-[12px]">event</span> {new Date(task.deadline).toLocaleDateString()}
                          </span>
                        )}
                        {task.checklist && task.checklist.length > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded w-fit">
                            <span className="material-symbols-outlined text-[12px]">check_box</span> {task.checklist.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Status Badge */}
                <td className="px-6 py-4">
                  <span
                    onClick={(e) => { e.stopPropagation(); cycleStatus(task); }}
                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold cursor-pointer select-none transition-all hover:brightness-95 ${STATUS_MAP[task.status].bg} ${STATUS_MAP[task.status].color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-70`}></span>
                    {STATUS_MAP[task.status].label}
                  </span>
                </td>

                {/* Prioridade */}
                <td className="px-6 py-4">
                  {task.is_high_priority ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/20 px-2 py-0.5 rounded">
                      <span className="material-symbols-outlined text-[14px]">priority_high</span> Alta
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-medium">Normal</span>
                  )}
                </td>

                <td className="px-6 py-4 text-sm text-slate-500">{formatDate(task.created_at)}</td>

                <td className="px-6 py-4">
                  <div className={`flex items-center gap-1.5 text-xs font-bold ${task.origin === 'Recorrente' ? 'text-primary' : 'text-slate-500'}`}>
                    <span className="material-symbols-outlined text-sm">{task.origin === 'Recorrente' ? 'sync' : 'person'}</span>
                    {task.origin}
                  </div>
                </td>

                {/* Ações */}
                <td className="px-6 py-4 text-right">
                  <div className="opacity-0 group-hover:opacity-100 flex items-center justify-end gap-2 transition-all">
                    <button onClick={() => openEditTaskModal(task)} className="p-1 text-slate-400 hover:text-primary transition-colors" title="Editar">
                      <span className="material-symbols-outlined text-lg">edit</span>
                    </button>
                    <button onClick={() => handleDelete(task.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors" title="Excluir">
                      <span className="material-symbols-outlined text-lg">delete</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- MODAL DE CRIAR/EDITAR --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={closeModal}
          ></div>

          <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 transform transition-all animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-5 custom-scrollbar">
              <form id="taskForm" onSubmit={handleSave} className="space-y-5">

                {/* Título */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Título da Tarefa</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Ex: Revisar contrato..."
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                {/* Descrição */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição</label>
                  <textarea
                    rows={2}
                    placeholder="Adicione detalhes..."
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none resize-none"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  ></textarea>
                </div>

                {/* Data e Status (Grid) */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Prazo */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Prazo (Deadline)</label>
                    <input
                      type="datetime-local"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-600"
                      value={formData.deadline}
                      onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    />
                  </div>

                  {/* Status */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
                    <div className="relative">
                      <select
                        className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none appearance-none"
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      >
                        <option value="PENDING">Pendente</option>
                        <option value="IN_PROGRESS">Em Andamento</option>
                        <option value="COMPLETED">Concluído</option>
                        <option value="BACKLOG">Backlog</option>
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 pointer-events-none text-lg">expand_more</span>
                    </div>
                  </div>
                </div>

                {/* Responsável no Bitrix24 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Responsável no Bitrix24</label>
                  <div className="relative">
                    <select
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none appearance-none"
                      value={formData.responsible_id}
                      onChange={(e) => setFormData({ ...formData, responsible_id: e.target.value })}
                    >
                      <option value="">Selecione um responsável...</option>
                      {bitrixUsers.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.name} {user.work_position ? `(${user.work_position})` : ''}
                        </option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-2.5 text-slate-400 pointer-events-none text-lg">person</span>
                  </div>
                </div>

                {/* Prioridade */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Prioridade</label>
                  <div
                    className={`flex items-center justify-between px-4 py-2.5 rounded-lg border cursor-pointer transition-all ${formData.is_high_priority ? 'border-rose-200 bg-rose-50 dark:bg-rose-900/10 dark:border-rose-800' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`}
                    onClick={() => setFormData({ ...formData, is_high_priority: !formData.is_high_priority })}
                  >
                    <span className={`text-sm font-semibold ${formData.is_high_priority ? 'text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`}>
                      {formData.is_high_priority ? 'Alta Prioridade' : 'Normal'}
                    </span>
                    <div className={`w-9 h-5 rounded-full relative transition-colors ${formData.is_high_priority ? 'bg-rose-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                      <div className={`absolute top-0.5 size-4 bg-white rounded-full transition-all shadow-sm ${formData.is_high_priority ? 'left-[18px]' : 'left-0.5'}`}></div>
                    </div>
                  </div>
                </div>

                {/* Seção Checklist */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Checklist</label>

                  {/* Input Add Item */}
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      placeholder="Adicionar item..."
                      value={newChecklistItem}
                      onChange={e => setNewChecklistItem(e.target.value)}
                      onKeyDown={addChecklistItem}
                    />
                    <button
                      type="button"
                      onClick={addChecklistItem}
                      className="px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 transition-colors"
                    >
                      <span className="material-symbols-outlined text-xl">add</span>
                    </button>
                  </div>

                  {/* Lista de Itens */}
                  <ul className="space-y-2">
                    {formData.checklist.map((item, idx) => (
                      <li key={idx} className="flex justify-between items-center text-sm bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-lg group">
                        <span className="text-slate-700 dark:text-slate-300">{item.title}</span>
                        <button
                          type="button"
                          onClick={() => removeChecklistItem(idx)}
                          className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </li>
                    ))}
                    {formData.checklist.length === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-2">Nenhum item na lista.</p>
                    )}
                  </ul>
                </div>

              </form>
            </div>

            {/* Footer com Botões */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="taskForm"
                disabled={saving}
                className="px-6 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></span>}
                {editingTask ? 'Salvar Alterações' : 'Criar Tarefa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;