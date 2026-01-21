import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState([
    { label: 'Tarefas Pendentes', value: '0', change: '...', color: 'blue', icon: 'pending_actions' },
    { label: 'Tarefas Concluídas', value: '0', change: '...', color: 'emerald', icon: 'task_alt' },
    { label: 'Recorrências Ativas', value: '0', change: 'Automação', color: 'orange', icon: 'sync' },
    { label: 'Sincronização Bitrix', value: '0%', change: 'Saúde', color: 'indigo', icon: 'hub' },
  ]);
  const [automations, setAutomations] = useState<any[]>([]);
  const [userName, setUserName] = useState('usuário');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await (supabase.auth as any).getUser();
      if (!user) return;

      setUserName(user.user_metadata?.full_name?.split(' ')[0] || 'usuário');

      // Buscar contagens reais
      // NOTA: Usando os status em INGLÊS ('PENDING', 'COMPLETED') conforme definido no SQL
      const [pending, completed, recurring, logs] = await Promise.all([
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'PENDING'),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'COMPLETED'),
        supabase.from('recurring_tasks').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('automation_logs').select('status', { count: 'exact' }) // Pegar todos os logs para calcular %
      ]);

      const totalLogs = logs.data?.length || 0;
      const successLogs = logs.data?.filter(l => l.status === 'Sucesso').length || 0;
      const syncRate = totalLogs > 0 ? Math.round((successLogs / totalLogs) * 100) : 100;

      setStats([
        { label: 'Tarefas Pendentes', value: String(pending.count || 0), change: 'Tempo Real', color: 'blue', icon: 'pending_actions' },
        { label: 'Tarefas Concluídas', value: String(completed.count || 0), change: 'Total', color: 'emerald', icon: 'task_alt' },
        { label: 'Recorrências Ativas', value: String(recurring.count || 0), change: 'Automação', color: 'orange', icon: 'sync' },
        { label: 'Sincronização Bitrix', value: `${syncRate}%`, change: 'Saúde', color: 'indigo', icon: 'hub' },
      ]);

      // Buscar próximas recorrências da tabela correta 'recurring_tasks'
      const { data: recurringData } = await supabase
        .from('recurring_tasks')
        .select('*')
        .order('next_run', { ascending: true }) // Ordena pela próxima execução
        .limit(4);

      if (recurringData) setAutomations(recurringData);

    } catch (error) {
      console.error('Erro ao buscar dados do dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {loading ? 'Carregando visão geral...' : `Bem-vindo de volta, ${userName}.`}
          </h3>
          <p className="text-slate-500 text-sm mt-1">
            {stats[0].value === '0'
              ? 'Tudo em dia por aqui! Nenhuma tarefa pendente no momento.'
              : `Você tem ${stats[0].value} tarefas pendentes que requerem sua atenção.`}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/tasks')} className="flex items-center gap-2 px-4 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-200 transition-colors">
            <span className="material-symbols-outlined !text-lg">add</span>
            Nova Tarefa
          </button>
          <button onClick={() => navigate('/recurring/config')} className="flex items-center gap-2 px-4 h-10 rounded-lg bg-primary text-white text-sm font-bold shadow-sm hover:opacity-90 transition-opacity">
            <span className="material-symbols-outlined !text-lg">repeat</span>
            Nova Recorrência
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 hover:border-primary transition-all shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className={`size-10 rounded-lg flex items-center justify-center text-${stat.color}-600 bg-${stat.color}-50 dark:bg-${stat.color}-900/20`}>
                <span className="material-symbols-outlined">{stat.icon}</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider text-slate-400 border border-slate-100 dark:border-slate-700">
                {stat.change}
              </span>
            </div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">{stat.label}</p>
            <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Agendamentos Ativos</h2>
            <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded-full">SISTEMA</span>
          </div>
          <button onClick={() => navigate('/recurring')} className="text-primary text-sm font-bold hover:underline">Ver Todos</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-900/30">
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Nome da Automação</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Tipo</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Horário</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</th>
                <th className="px-6 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {automations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm italic">
                    Nenhuma automação configurada ainda.
                  </td>
                </tr>
              ) : (
                automations.map((auto) => (
                  <tr key={auto.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                          <span className="material-symbols-outlined !text-lg">sync</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{auto.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 capitalize">
                      {/* Corrigido para 'type' conforme o banco renomeado e formatação */}
                      {auto.type ? auto.type.toLowerCase() : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                      {/* Formatação para remover os segundos (HH:MM:SS -> HH:MM) */}
                      {auto.schedule_time ? auto.schedule_time.slice(0, 5) : '--:--'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-xs font-medium ${auto.is_active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                        <span className={`size-1.5 rounded-full ${auto.is_active ? 'bg-emerald-600' : 'bg-slate-400'}`}></span> {auto.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {/* Navegação para editar ao clicar no botão */}
                      <button onClick={() => navigate(`/recurring/config?id=${auto.id}`)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white">
                        <span className="material-symbols-outlined">edit</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;