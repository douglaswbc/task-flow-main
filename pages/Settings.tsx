import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

const Settings: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [activeSection, setActiveSection] = useState('profile');

  // Estados de Perfil
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    role: ''
  });

  // Estados de Preferências
  const [preferences, setPreferences] = useState({
    timezone: '(GMT-03:00) America/Sao_Paulo',
    language: 'Português (BR)'
  });

  // Estados de Segurança e Sessão
  const [sessions, setSessions] = useState<any[]>([]);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  // Estados de Integração
  const [bitrixWebhook, setBitrixWebhook] = useState('');
  const [bitrixAccessCode, setBitrixAccessCode] = useState(''); // NOVO: Estado para o código

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    try {
      const { data: { user }, error } = await (supabase.auth as any).getUser();
      if (error) throw error;
      if (user) {
        setUser(user);
        setProfile({
          full_name: user.user_metadata?.full_name || '',
          email: user.email || '',
          role: user.user_metadata?.role || 'Administrador'
        });

        // Buscar Integrações (Webhook e Código)
        const { data: integration } = await supabase
          .from('integrations')
          .select('webhook_url, access_code') // <-- Busca o access_code
          .eq('service_name', 'bitrix24')
          .eq('user_id', user.id)
          .maybeSingle();

        if (integration) {
          setBitrixWebhook(integration.webhook_url || '');
          setBitrixAccessCode(integration.access_code || ''); // <-- Define no estado
        }
      }

      // Buscar Sessões (Simulado/Mock para exemplo visual, já que Supabase Auth Client não expõe sessions list facilmente no client-side free tier)
      const { data: { session } } = await (supabase.auth as any).getSession();
      setSessions([
        {
          id: session?.access_token.slice(-10),
          device: 'Chrome on Windows',
          location: 'São Paulo, BR',
          ip: '192.168.1.1',
          last_active: 'Agora',
          current: true
        }
      ]);

    } catch (error: any) {
      console.error('Erro ao carregar dados:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      setSaving(true);
      const { error } = await (supabase.auth as any).updateUser({
        data: { full_name: profile.full_name }
      });

      if (error) throw error;

      // Atualizar também na tabela profiles se existir
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: profile.full_name,
        role: profile.role,
        updated_at: new Date()
      });

      toast.success('Perfil atualizado com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao atualizar perfil: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBitrix = async () => {
    if (!bitrixWebhook.startsWith('http')) {
      return toast.error('Insira uma URL de Webhook válida.');
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('integrations')
        .upsert({
          user_id: user.id,
          service_name: 'bitrix24',
          webhook_url: bitrixWebhook,
          access_code: bitrixAccessCode.toUpperCase(), // <-- Salva sempre em MAIÚSCULO
          is_active: true
        }, { onConflict: 'user_id, service_name' });

      if (error) throw error;
      toast.success('Integração Bitrix24 salva!');
      setBitrixAccessCode(prev => prev.toUpperCase()); // Atualiza input visualmente
    } catch (error: any) {
      toast.error('Erro ao salvar integração: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      setSaving(true);
      const { error } = await (supabase.auth as any).updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Senha alterada com sucesso!');
      setShowPasswordModal(false);
      setNewPassword('');
    } catch (error: any) {
      toast.error('Erro ao alterar senha: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const copyPublicLink = () => {
    const url = `${window.location.origin}/#/import-returns`;
    navigator.clipboard.writeText(url);
    toast.success('Link copiado para a área de transferência!');
  };

  if (loading) return <div className="p-10 text-center text-slate-500">Carregando configurações...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      <Toaster position="top-right" />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Configurações</h2>
          <p className="text-slate-500 text-sm">Gerencie sua conta e preferências do sistema.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar de Navegação */}
        <nav className="lg:w-64 flex-shrink-0 space-y-1">
          {[
            { id: 'profile', icon: 'person', label: 'Meu Perfil' },
            { id: 'security', icon: 'lock', label: 'Segurança & Login' },
            { id: 'integrations', icon: 'hub', label: 'Integrações' }, // Bitrix24 aqui
            { id: 'preferences', icon: 'tune', label: 'Preferências' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-lg transition-all ${activeSection === item.id
                  ? 'bg-white dark:bg-slate-800 text-primary shadow-sm ring-1 ring-slate-200 dark:ring-slate-700'
                  : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Área de Conteúdo */}
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 lg:p-8">

          {/* --- SEÇÃO: PERFIL --- */}
          {activeSection === 'profile' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center gap-4">
                <div className="relative group cursor-pointer">
                  <div className="w-20 h-20 rounded-full bg-slate-200 overflow-hidden border-2 border-white dark:border-slate-800 shadow-md">
                    {user?.user_metadata?.avatar_url ? (
                      <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 bg-slate-100 dark:bg-slate-800">
                        <span className="material-symbols-outlined text-3xl">person</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="material-symbols-outlined text-white text-sm">edit</span>
                  </div>
                  <input type="file" ref={fileInputRef} className="hidden" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Foto de Perfil</h3>
                  <p className="text-xs text-slate-500">JPG, GIF ou PNG. Max 1MB.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Nome Completo</label>
                  <input
                    type="text"
                    value={profile.full_name}
                    onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Cargo / Função</label>
                  <input
                    type="text"
                    value={profile.role}
                    disabled
                    className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleUpdateProfile}
                  disabled={saving}
                  className="px-6 py-2.5 bg-primary text-white font-bold rounded-lg shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </div>
          )}

          {/* --- SEÇÃO: INTEGRAÇÕES (BITRIX & CÓDIGO) --- */}
          {activeSection === 'integrations' && (
            <div className="space-y-8 animate-in fade-in duration-300">

              {/* Card Webhook */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500">
                    <span className="material-symbols-outlined">api</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Bitrix24 Webhook</h3>
                    <p className="text-xs text-slate-500">Conecte seu CRM para sincronizar tarefas e devoluções.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Webhook URL (Inbound)</label>
                  <input
                    type="text"
                    placeholder="https://seu-bitrix.bitrix24.com.br/rest/1/xxxx..."
                    value={bitrixWebhook}
                    onChange={(e) => setBitrixWebhook(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                  <p className="text-[10px] text-slate-400">
                    Certifique-se de que o webhook tem permissões: <strong>task, crm, user</strong>.
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800 my-6"></div>

              {/* Card Acesso Público */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500">
                    <span className="material-symbols-outlined">public</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Importação Pública</h3>
                    <p className="text-xs text-slate-500">Configure o acesso para a página de importação de devoluções.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Campo Código de Acesso */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Código de Acesso da Loja</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Ex: LOJA01"
                        value={bitrixAccessCode}
                        onChange={(e) => setBitrixAccessCode(e.target.value.toUpperCase())}
                        className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold tracking-widest focus:ring-2 focus:ring-primary/20 outline-none uppercase"
                      />
                      <span className="absolute right-3 top-2.5 material-symbols-outlined text-slate-400 text-lg">vpn_key</span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Este código será solicitado a qualquer pessoa que tentar usar a página de importação pública.
                    </p>
                  </div>

                  {/* Campo Link Público (Apenas Leitura/Cópia) */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Link da Página Pública</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/#/import-returns`}
                        className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-500 cursor-not-allowed"
                      />
                      <button
                        onClick={copyPublicLink}
                        className="px-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-slate-600 dark:text-slate-300 transition-colors"
                        title="Copiar Link"
                      >
                        <span className="material-symbols-outlined text-lg">content_copy</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleSaveBitrix}
                  disabled={saving}
                  className="px-6 py-2.5 bg-primary text-white font-bold rounded-lg shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar Configurações'}
                </button>
              </div>
            </div>
          )}

          {/* --- SEÇÃO: SEGURANÇA --- */}
          {activeSection === 'security' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Alterar Senha</h3>
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Senha de Acesso</p>
                    <p className="text-xs text-slate-500">Recomendamos usar uma senha forte.</p>
                  </div>
                  <button onClick={() => setShowPasswordModal(true)} className="text-sm font-bold text-primary hover:underline">
                    Alterar Senha
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Sessões Ativas</h3>
                <div className="space-y-3">
                  {sessions.map((sess, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center">
                          <span className="material-symbols-outlined text-slate-500">devices</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{sess.device}</p>
                          <p className="text-xs text-slate-500">
                            {sess.location} • {sess.ip} • {sess.current ? <span className="text-emerald-500 font-bold">Atual</span> : 'Outra Sessão'}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded">Ativo</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* --- SEÇÃO: PREFERÊNCIAS --- */}
          {activeSection === 'preferences' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Idioma</label>
                  <select
                    value={preferences.language}
                    onChange={(e) => setPreferences({ ...preferences, language: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    <option>Português (BR)</option>
                    <option>English (US)</option>
                    <option>Español</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Fuso Horário</label>
                  <select
                    value={preferences.timezone}
                    onChange={(e) => setPreferences({ ...preferences, timezone: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    <option>(GMT-03:00) America/Sao_Paulo</option>
                    <option>(GMT-00:00) UTC</option>
                  </select>
                </div>
              </div>

              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 text-sm rounded-lg flex gap-3">
                <span className="material-symbols-outlined">info</span>
                <span>As preferências são salvas localmente no seu navegador.</span>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Modal de Senha */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold mb-1 text-slate-900 dark:text-white">Alterar Senha</h3>
            <p className="text-sm text-slate-500 mb-4">Digite sua nova senha abaixo.</p>

            <input
              type="password"
              placeholder="Nova senha"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary outline-none mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 py-2.5 font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleChangePassword}
                disabled={saving || !newPassword}
                className="flex-1 bg-primary text-white py-2.5 rounded-lg font-bold shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;