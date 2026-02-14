
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Cast to any to bypass type error for signInWithPassword on SupabaseAuthClient
    const { error } = await (supabase.auth as any).signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message);
      setLoading(false);
    } else {
      navigate('/');
    }
  };

  const toggleShowPassword = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-display transition-colors duration-300">
      <header className="w-full flex items-center justify-between px-6 py-4 md:px-12 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-background-dark transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary p-1.5 rounded-lg flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-xl">account_tree</span>
          </div>
          <h2 className="text-gray-900 dark:text-white text-lg font-bold tracking-tight">TaskFlow</h2>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 relative overflow-hidden">
        <div className="w-full max-w-[440px] z-10">
          <div className="bg-white dark:bg-[#242830] p-8 md:p-10 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800">
            <div className="flex flex-col items-center mb-8 text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">login</span>
              </div>
              <h1 className="text-gray-900 dark:text-white text-2xl font-bold tracking-tight">Acesse sua conta</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Bem-vindo ao TaskFlow.</p>
            </div>

            {error && (
              <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-xs font-bold text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 ml-1">E-mail</label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px] group-focus-within:text-primary transition-colors">mail</span>
                  <input
                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-background-dark dark:text-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm"
                    placeholder="seu@email.com"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-[13px] font-semibold text-gray-700 dark:text-gray-300">Senha</label>
                  <Link className="text-[12px] font-bold text-primary hover:text-primary/80" to="/recovery">Esqueceu a senha?</Link>
                </div>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px] group-focus-within:text-primary transition-colors">lock</span>
                  <input
                    className="w-full pl-11 pr-11 py-3 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-background-dark dark:text-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm"
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary transition-colors"
                    onClick={toggleShowPassword}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? 'visibility' : 'visibility_off'}
                    </span>
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-lg transition-all flex items-center justify-center gap-2 group shadow-lg shadow-primary/20 mt-2 disabled:opacity-50"
              >
                {loading ? 'Entrando...' : (
                  <>
                    <span>Entrar no Sistema</span>
                    <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                  </>
                )}
              </button>
            </form>

            {/* 
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Ainda não tem conta? <Link className="text-primary font-bold hover:underline" to="/signup">Criar conta grátis</Link>
              </p>
            </div>
            */}
          </div>

          <div className="mt-8 flex flex-col items-center gap-4">
            <div className="flex items-center gap-6 text-[12px] font-medium text-gray-400">
              <Link to="/privacy" className="hover:text-primary">Privacidade</Link>
              <Link to="/terms" className="hover:text-primary">Termos</Link>
              <Link to="/cookies" className="hover:text-primary">Cookies</Link>
            </div>
          </div>
        </div>

        <div className="fixed top-0 right-0 -z-10 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
      </main>
    </div>
  );
};

export default Login;
