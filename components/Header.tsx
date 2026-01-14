
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface Notification {
  id: string;
  type: 'task_due' | 'task_failed' | 'system' | 'reminder';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  task_id?: string;
}

const Header: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/': return 'Visão Geral do Dashboard';
      case '/tasks': return 'Minhas Tarefas';
      case '/recurring': return 'Tarefas Recorrentes';
      case '/recurring/config': return 'Configurar Recorrência';
      case '/logs': return 'Histórico de Logs';
      case '/settings': return 'Configurações da Conta';
      default: return 'TaskFlow';
    }
  };

  // Buscar notificações
  useEffect(() => {
    fetchNotifications();
    // Polling para novas notificações a cada 30 segundos
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar notificações do usuário (assumindo que há uma tabela notifications)
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Erro ao buscar notificações:', error);
        return;
      }

      setNotifications(data || []);
      setUnreadCount(data?.filter(n => !n.read).length || 0);
    } catch (error) {
      console.error('Erro ao buscar notificações:', error);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar em tarefas
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, description')
        .eq('user_id', user.id)
        .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
        .limit(5);

      // Buscar em tarefas recorrentes
      const { data: recurring } = await supabase
        .from('recurring_tasks')
        .select('id, name, description')
        .eq('user_id', user.id)
        .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
        .limit(5);

      // Buscar em logs
      const { data: logs } = await supabase
        .from('task_logs')
        .select('id, task_name, message')
        .eq('user_id', user.id)
        .or(`task_name.ilike.%${searchTerm}%,message.ilike.%${searchTerm}%`)
        .limit(5);

      // Navegar para a página mais relevante com resultados
      if (tasks && tasks.length > 0) {
        navigate('/tasks', { state: { searchTerm } });
      } else if (recurring && recurring.length > 0) {
        navigate('/recurring', { state: { searchTerm } });
      } else if (logs && logs.length > 0) {
        navigate('/logs', { state: { searchTerm } });
      } else {
        // Nenhum resultado encontrado
        alert('Nenhum resultado encontrado para: ' + searchTerm);
      }
    } catch (error) {
      console.error('Erro na busca:', error);
      alert('Erro ao realizar busca');
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Erro ao marcar notificação como lida:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'task_due': return 'schedule';
      case 'task_failed': return 'error';
      case 'system': return 'info';
      case 'reminder': return 'notifications';
      default: return 'notifications';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'task_due': return 'text-yellow-600';
      case 'task_failed': return 'text-red-600';
      case 'system': return 'text-blue-600';
      case 'reminder': return 'text-green-600';
      default: return 'text-slate-600';
    }
  };

  return (
    <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-background-dark/80 backdrop-blur flex items-center justify-between px-8 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">{getPageTitle()}</h2>
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden md:block"></div>
        <div className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-500">
          <span>Workspace</span>
          <span className="material-symbols-outlined !text-xs">chevron_right</span>
          <span className="text-slate-900 dark:text-white">TaskFlow</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <form onSubmit={handleSearch} className="relative group hidden sm:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
          <input
            className="h-9 w-64 bg-slate-100 dark:bg-slate-800 border-none rounded-lg pl-10 pr-4 text-sm focus:ring-1 focus:ring-primary transition-all placeholder:text-slate-500"
            placeholder="Pesquisa rápida..."
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </form>
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="size-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-colors relative"
          >
            <span className="material-symbols-outlined !text-lg">notifications</span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-900 dark:text-white">Notificações</h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-slate-500">
                    Nenhuma notificação
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer ${
                        !notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      onClick={() => {
                        if (!notification.read) markAsRead(notification.id);
                        if (notification.task_id) {
                          navigate('/tasks');
                        }
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <span className={`material-symbols-outlined !text-lg ${getNotificationColor(notification.type)}`}>
                          {getNotificationIcon(notification.type)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {notification.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {notification.message}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {new Date(notification.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {notifications.length > 0 && (
                <div className="p-3 text-center">
                  <button
                    onClick={() => navigate('/logs')}
                    className="text-sm text-primary hover:underline"
                  >
                    Ver todas as notificações
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
