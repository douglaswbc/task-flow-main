import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useLocation } from 'react-router-dom';

const LogsHistory: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const location = useLocation();

  // Estados para paginação
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchLogs(page);

    if (location.state?.searchTerm) {
      setSearchTerm(location.state.searchTerm);
    }
  }, [page, location.state]); // Recarrega sempre que a página ou o termo mudar

  const fetchLogs = async (pageNumber: number) => {
    try {
      setLoading(true);

      // Cálculo do intervalo (ex: pág 1 = 0 a 9, pág 2 = 10 a 19)
      const from = (pageNumber - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      // Busca dados E a contagem total para saber quantas páginas existem
      const { data, count, error } = await supabase
        .from('automation_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      setLogs(data || []);

      // Calcula total de páginas
      if (count) {
        setTotalPages(Math.ceil(count / itemsPerPage));
      }
    } catch (error) {
      console.error('Erro ao buscar logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNextPage = () => {
    if (page < totalPages) setPage(prev => prev + 1);
  };

  const filteredLogsList = logs.filter(log =>
    (log.task_name && log.task_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (log.error_message && log.error_message.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handlePrevPage = () => {
    if (page > 1) setPage(prev => prev - 1);
  };

  const filteredLogs = filteredLogsList;

  return (
    <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex-1 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 lg:gap-6 mb-6 lg:mb-8">
          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Logs de Automação</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Monitore cada execução automática do sistema.</p>
          </div>
          <button onClick={() => fetchLogs(page)} className="px-3 sm:px-4 py-2 text-xs font-bold bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 transition-colors">
            Atualizar Lista
          </button>
        </div>

        {/* Campo de Busca */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="relative w-full sm:w-80">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
            <input
              type="text"
              placeholder="Buscar logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            />
          </div>
          <p className="text-xs text-slate-500">{filteredLogs.length} log(s) encontrado(s)</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Tarefa / Recorrência</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Executado em</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Info</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-400">Carregando histórico...</td></tr>
                ) : filteredLogs.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-slate-400 italic">Nenhum log encontrado.</td></tr>
                ) : filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {/* Exibe o task_name, já que 'name' não existe na tabela logs conforme o SQL anterior */}
                        <span className="text-sm font-semibold">{log.task_name || 'Tarefa sem nome'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {log.execution_date
                        ? new Date(log.execution_date).toLocaleString('pt-BR')
                        : new Date(log.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold ${log.status === 'Sucesso' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400'}`}>
                        <span className={`size-1.5 rounded-full ${log.status === 'Sucesso' ? 'bg-emerald-600' : 'bg-rose-600'}`}></span>
                        {log.status}
                      </span>
                      {log.error_message && (
                        <p className="text-[10px] text-rose-500 mt-1 max-w-[150px] truncate" title={log.error_message}>{log.error_message}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => log.error_message && alert(`Detalhes do Erro:\n${log.error_message}`)}
                        className={`material-symbols-outlined ${log.error_message ? 'text-rose-500 cursor-pointer' : 'text-slate-200 cursor-default'} text-lg`}
                      >
                        info
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Rodapé com Paginação */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500">
              Página <span className="font-bold text-slate-900 dark:text-white">{page}</span> de <span className="font-bold">{totalPages}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={handlePrevPage}
                disabled={page === 1}
                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="material-symbols-outlined text-lg">chevron_left</span>
              </button>
              <button
                onClick={handleNextPage}
                disabled={page >= totalPages}
                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span className="material-symbols-outlined text-lg">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LogsHistory;