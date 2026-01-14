
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const Recovery: React.FC = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Cast to any to bypass type error for resetPasswordForEmail on SupabaseAuthClient
    const { error } = await (supabase.auth as any).resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#/settings`,
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen flex flex-col font-display">
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="bg-white dark:bg-[#242830] p-8 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800">
            <div className="flex flex-col items-center mb-8 text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                <span className="material-symbols-outlined text-primary text-2xl">lock_reset</span>
              </div>
              <h1 className="text-gray-900 dark:text-white text-2xl font-bold tracking-tight">Recuperar senha</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">
                {sent ? 'Verifique seu e-mail para as instruções.' : 'Enviaremos um link de redefinição para você.'}
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-xs font-bold text-center">
                {error}
              </div>
            )}

            {!sent ? (
              <form onSubmit={handleRecovery} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 ml-1">E-mail da conta</label>
                  <input 
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-background-dark dark:text-white focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none text-sm" 
                    placeholder="seu@email.com" 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required 
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-lg transition-all disabled:opacity-50"
                >
                  {loading ? 'Enviando...' : 'Enviar link de recuperação'}
                </button>
              </form>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Se você não recebeu o e-mail em alguns minutos, verifique sua pasta de spam.</p>
                <button onClick={() => setSent(false)} className="text-primary font-bold hover:underline">Tentar outro e-mail</button>
              </div>
            )}

            <div className="mt-8 text-center border-t border-gray-100 dark:border-gray-800 pt-6">
              <Link className="text-sm text-gray-500 hover:text-primary flex items-center justify-center gap-2" to="/login">
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                Voltar para o login
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Recovery;
