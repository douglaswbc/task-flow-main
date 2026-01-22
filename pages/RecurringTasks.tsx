import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const RecurringTasks: React.FC = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [bitrixUsers, setBitrixUsers] = useState<{ id: string; name: string; work_position: string }[]>([]);

  useEffect(() => {
    fetchRecurringTasks();
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

  const fetchRecurringTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('recurring_tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Erro ao buscar recorrências:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('recurring_tasks')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (!error) {
      setTasks(tasks.map(t => t.id === id ? { ...t, is_active: !currentStatus } : t));
    } else {
      alert('Erro ao atualizar status.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta recorrência permanentemente?')) return;

    try {
      const { error } = await supabase
        .from('recurring_tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setTasks(tasks.filter(t => t.id !== id));
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('Não foi possível excluir a tarefa.');
    }
  };

  const handleEdit = (id: string) => {
    navigate(`/recurring/config?id=${id}`);
  };

  const filteredTasks = tasks.filter(task =>
    task.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getResponsibleName = (id: string | null) => {
    if (!id) return 'Não definido';
    const user = bitrixUsers.find(u => u.id === id);
    return user ? user.name : 'ID: ' + id;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Tarefas Recorrentes</h2>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">Gerencie e monitore seus agendamentos de fluxo de trabalho automatizado.</p>
        </div>
        <button onClick={() => navigate('/recurring/config')} className="bg-primary text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-bold text-sm flex items-center gap-2 hover:opacity-90 transition-opacity shadow-lg shadow-primary/20">
          <span className="material-symbols-outlined text-sm">add</span>
          Nova Recorrência
        </button>
      </div>

      {/* Campo de Busca */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
          <input
            type="text"
            placeholder="Buscar recorrências..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
          />
        </div>
        <p className="text-xs text-slate-500">{filteredTasks.length} recorrência(s) encontrada(s)</p>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
                <th className="py-3 px-4 sm:py-4 sm:px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome da Tarefa</th>
                <th className="py-3 px-4 sm:py-4 sm:px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Frequência</th>
                <th className="py-3 px-4 sm:py-4 sm:px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Horário</th>
                <th className="py-3 px-4 sm:py-4 sm:px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Responsável</th>
                <th className="py-3 px-4 sm:py-4 sm:px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Próxima Execução</th>
                <th className="py-3 px-4 sm:py-4 sm:px-6 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr><td colSpan={5} className="py-8 sm:py-10 text-center text-slate-400">Buscando automações...</td></tr>
              ) : filteredTasks.length === 0 ? (
                <tr><td colSpan={5} className="py-8 sm:py-10 text-center text-slate-400 italic">Nenhuma recorrência encontrada.</td></tr>
              ) : filteredTasks.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => handleEdit(task.id)}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group cursor-pointer ${!task.is_active ? 'opacity-60' : ''}`}
                >
                  <td className="py-4 sm:py-5 px-4 sm:px-6">
                    <div className="flex items-center gap-3">
                      <div className={`size-8 rounded flex items-center justify-center bg-primary/10 text-primary`}>
                        <span className="material-symbols-outlined text-lg">sync</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{task.name}</p>
                          {task.checklist && task.checklist.length > 0 && (
                            <span className="material-symbols-outlined text-xs text-primary" title={`${task.checklist.length} itens no checklist`}>checklist</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">{task.description || 'Sem descrição'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 sm:py-5 px-4 sm:px-6 text-center">
                    <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-[10px] font-bold text-slate-500 dark:text-gray-300 uppercase">{task.type}</span>
                  </td>
                  <td className="py-4 sm:py-5 px-4 sm:px-6">
                    <p className="text-sm font-medium dark:text-gray-200">{task.schedule_time.slice(0, 5)}</p>
                    {task.deadline_relative > 0 && (
                      <p className="text-[10px] text-slate-400">Prazo: +{task.deadline_relative / 60}h</p>
                    )}
                  </td>
                  <td className="py-4 sm:py-5 px-4 sm:px-6">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <span className="material-symbols-outlined text-sm">person</span>
                      <p className="text-sm font-medium">{getResponsibleName(task.responsible_id)}</p>
                    </div>
                  </td>
                  <td className="py-4 sm:py-5 px-4 sm:px-6">
                    <div className={`flex items-center gap-2 ${task.is_active ? 'text-primary' : 'text-slate-400'}`}>
                      <span className="material-symbols-outlined text-sm">{task.is_active ? 'timer' : 'pause_circle'}</span>
                      <p className="text-sm font-bold">{task.next_run ? new Date(task.next_run).toLocaleString('pt-BR') : 'Aguardando'}</p>
                    </div>
                  </td>
                  <td className="py-4 sm:py-5 px-4 sm:px-6">
                    <div className="flex items-center justify-end gap-2 sm:gap-4">
                      <div
                        className="relative inline-flex items-center cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStatus(task.id, task.is_active);
                        }}
                      >
                        <div className={`w-9 h-5 rounded-full transition-all ${task.is_active ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`}>
                          <div className={`size-4 bg-white rounded-full mt-0.5 transition-all ${task.is_active ? 'ml-4.5 translate-x-4.5' : 'ml-0.5'}`}></div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(task.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 transition-all"
                        title="Excluir recorrência"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RecurringTasks;