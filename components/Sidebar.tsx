import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';

interface SidebarProps {
  onLogout: () => void;
  user?: any;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout, user }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false); // Estado para controlar se o sidebar está aberto em mobile

  const navItems = [
    { to: '/', icon: 'dashboard', label: 'Dashboard' },
    { to: '/tasks', icon: 'check_circle', label: 'Minhas Tarefas' },
    // Item Novo Adicionado Aqui
    { to: '/import-returns', icon: 'upload_file', label: 'Importar Devoluções' },
    { to: '/recurring', icon: 'sync', label: 'Recorrências' },
    { to: '/logs', icon: 'history', label: 'Histórico de Logs' },
  ];

  const managementItems = [
    { to: '/catalog-settings', icon: 'inventory_2', label: 'Automação de Catálogos' },
    { to: '/instances', icon: 'smartphone', label: 'Instâncias WhatsApp' },
    { to: '/settings', icon: 'settings', label: 'Configurações' },
  ];

  const allItems = [...navItems, ...managementItems];

  const filteredItems = allItems.filter(item =>
    item.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const userDisplayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário';

  const handleNavClick = () => {
    setIsOpen(false); // Fecha o sidebar ao clicar em um item
  };

  return (
    <>
      {/* Botão Hambúrguer para Mobile */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md"
      >
        <span className="material-symbols-outlined text-slate-600 dark:text-slate-400">menu</span>
      </button>

      {/* Overlay para Mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setIsOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <aside className={`w-64 lg:w-64 md:w-56 sm:w-48 border-r border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-background-dark h-full shrink-0 fixed lg:relative top-0 left-0 z-50 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}>
        <div className="p-4 lg:p-6 flex items-center gap-3">
          <div className="bg-primary rounded-lg p-1.5 text-white flex items-center justify-center">
            <span className="material-symbols-outlined !text-white">account_tree</span>
          </div>
          <h1 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">TaskFlow</h1>
        </div>

        {/* Campo de Busca */}
        <div className="px-4 pb-4">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">search</span>
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            />
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <div className="pb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Menu Principal</div>
          {filteredItems.filter(item => navItems.some(nav => nav.to === item.to)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${isActive
                  ? 'bg-primary/10 text-primary border-r-4 border-primary'
                  : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`
              }
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="text-sm font-semibold">{item.label}</span>
            </NavLink>
          ))}

          <div className="pt-8 pb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Gerenciamento</div>
          {filteredItems.filter(item => managementItems.some(man => man.to === item.to)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${isActive
                  ? 'bg-primary/10 text-primary border-r-4 border-primary'
                  : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`
              }
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="text-sm font-semibold">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="size-9 rounded-full bg-slate-200 shrink-0 overflow-hidden border border-slate-300 dark:border-slate-700">
              {user?.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <span className="material-symbols-outlined text-lg">account_circle</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold truncate text-slate-900 dark:text-white">{userDisplayName}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-tighter">Usuário Ativo</p>
            </div>
            <button onClick={onLogout} className="ml-auto text-slate-400 hover:text-red-500 transition-colors">
              <span className="material-symbols-outlined !text-lg">logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;