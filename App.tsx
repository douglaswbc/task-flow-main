
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
import ConfigureRecurrence from './pages/ConfigureRecurrence';
import Sidebar from './components/Sidebar';
import Header from './components/Header';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Pegar sessão inicial
    // Cast to any to bypass type errors for getSession on SupabaseAuthClient in this environment
    (supabase.auth as any).getSession().then(({ data: { session } }: any) => {
      setSession(session);
      setLoading(false);
    });

    // Escutar mudanças na auth
    // Cast to any to bypass type errors for onAuthStateChange on SupabaseAuthClient
    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange((_event: any, session: any) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const PrivateLayout = ({ children }: { children: React.ReactNode }) => {
    if (!session) return <Navigate to="/login" />;
    return (
      <div className="flex h-screen overflow-hidden">
        {/* Cast to any to bypass type errors for signOut on SupabaseAuthClient */}
        <Sidebar onLogout={async () => await (supabase.auth as any).signOut()} user={session.user} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10">
            {children}
          </main>
        </div>
      </div>
    );
  };

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" /> : <Login />} />
        <Route path="/signup" element={session ? <Navigate to="/" /> : <Signup />} />
        <Route path="/recovery" element={<Recovery />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/cookies" element={<Cookies />} />

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
