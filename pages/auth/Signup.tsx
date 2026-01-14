
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Cast to any to bypass type error for signUp on SupabaseAuthClient
    const { error } = await (supabase.auth as any).signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      alert('Verifique seu e-mail para confirmar a conta!');
      navigate('/login');
    }
  };

  const toggleShowPassword = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-display">
      <header className="w-full flex items-center px-12 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-background-dark">
        <Link to="/login" className="flex items-center gap-2.5">
          <div className="bg-primary p-1.5 rounded-lg flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-xl">account_tree</span>
          </div>
          <h2 className="text-gray-900 dark:text-white text-lg font-bold tracking-tight">TaskFlow</h2>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="w-full max-w-[480px] z-10">
          <div className="bg-white dark:bg-[#242830] p-8 md:p-10 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800">
            <div className="flex flex-col items-center mb-8 text-center">
              <h1 className="text-gray-900 dark:text-white text-2xl font-bold tracking-tight">Crie sua conta</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Comece a automatizar suas tarefas hoje mesmo.</p>
            </div>

            {error && (
              <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-xs font-bold text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleSignup} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 ml-1">Nome Completo</label>
                  <input 
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-background-dark dark:text-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm" 
                    placeholder="Ex: João Silva" 
                    type="text" 
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required 
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 ml-1">E-mail Corporativo</label>
                  <input 
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-background-dark dark:text-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm" 
                    placeholder="seu@email.com" 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required 
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 ml-1">Senha</label>
                <div className="relative group">
                  <input 
                    className="w-full pl-4 pr-11 py-3 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-background-dark dark:text-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm" 
                    placeholder="Mínimo 6 caracteres" 
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
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

              <div className="flex items-start gap-2 mt-4">
                <input type="checkbox" className="mt-1 rounded border-gray-300 text-primary focus:ring-primary" required />
                <p className="text-[12px] text-gray-500 leading-snug">
                  Eu concordo com os <Link to="/terms" className="text-primary font-bold">Termos de Serviço</Link> e <Link to="/privacy" className="text-primary font-bold">Política de Privacidade</Link>.
                </p>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-lg transition-all shadow-lg shadow-primary/20 mt-4 disabled:opacity-50"
              >
                {loading ? 'Processando...' : 'Criar minha conta'}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Já tem uma conta? <Link className="text-primary font-bold hover:underline" to="/login">Fazer login</Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Signup;
