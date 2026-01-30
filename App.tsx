import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import Recovery from './pages/auth/Recovery';
import Privacy from './pages/legal/Privacy';
import Terms from './pages/legal/Terms';
import Cookies from './pages/legal/Cookies';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import RecurringTasks from './pages/RecurringTasks';
import LogsHistory from './pages/LogsHistory';
import Settings from './pages/Settings';
import ImportReturns from './pages/ImportReturns';
import ConfigureRecurrence from './pages/ConfigureRecurrence';
import Sidebar from './components/Sidebar';
import Header from './components/Header';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (supabase.auth as any).getSession().then(({ data: { session } }: any) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange((_event: any, session: any) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  // Layout Privado (Com Menu e Header)
  const PrivateLayout = ({ children }: { children: React.ReactNode }) => {
    if (!session) {
      return <Navigate to="/login" />;
    }

    return (
      <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
        <Sidebar onLogout={() => supabase.auth.signOut()} user={session.user} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10">
            {children}
          </main>
        </div>
      </div>
    );
  };

  // Layout Público Simples (Opcional, para dar uma cara melhor à página pública)
  const PublicLayout = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6 lg:p-10">
      <div className="max-w-4xl mx-auto">
        {children}
      </div>
    </div>
  );

  return (
    <HashRouter>
      <Routes>
        {/* Rotas Públicas de Auth */}
        <Route path="/login" element={session ? <Navigate to="/" /> : <Login />} />
        <Route path="/signup" element={session ? <Navigate to="/" /> : <Signup />} />
        <Route path="/recovery" element={<Recovery />} />

        {/* Páginas Legais */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/cookies" element={<Cookies />} />

        {/* --- ROTA PÚBLICA DE IMPORTAÇÃO (MOVIDA PARA FORA DO PRIVATE) --- */}
        <Route path="/import-returns" element={
          <PublicLayout>
            <ImportReturns />
          </PublicLayout>
        } />
        {/* --------------------------------------------------------------- */}

        {/* Rotas Privadas (Protegidas) */}
        <Route path="/" element={<PrivateLayout><Dashboard /></PrivateLayout>} />
        <Route path="/tasks" element={<PrivateLayout><Tasks /></PrivateLayout>} />
        <Route path="/recurring" element={<PrivateLayout><RecurringTasks /></PrivateLayout>} />
        <Route path="/recurring/config" element={<PrivateLayout><ConfigureRecurrence /></PrivateLayout>} />
        <Route path="/logs" element={<PrivateLayout><LogsHistory /></PrivateLayout>} />
        <Route path="/settings" element={<PrivateLayout><Settings /></PrivateLayout>} />

        <Route path="*" element={<Navigate to={session ? "/" : "/login"} />} />
      </Routes>
    </HashRouter>
  );
};

export default App;