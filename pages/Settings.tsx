
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const Settings: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState({
    full_name: '',
    email: '',
    role: ''
  });
  const [preferences, setPreferences] = useState({
    timezone: '(GMT-03:00) America/Sao_Paulo',
    language: 'Português (BR)'
  });
  const [security, setSecurity] = useState({
    mfaEnabled: false,
    passwordLastChanged: 'Alterada há 3 meses'
  });
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [bitrixWebhook, setBitrixWebhook] = useState('');
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
          role: user.user_metadata?.role || ''
        });
        setPreferences({
          timezone: user.user_metadata?.timezone || '(GMT-03:00) America/Sao_Paulo',
          language: user.user_metadata?.language || 'Português (BR)'
        });
        setSecurity({
          mfaEnabled: user.user_metadata?.mfaEnabled || false,
          passwordLastChanged: user.user_metadata?.passwordLastChanged || 'Alterada há 3 meses'
        });
      }
      await fetchSessions();
      await fetchIntegrations();
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    try {
      const { data: { session }, error } = await (supabase.auth as any).getSession();
      if (error) throw error;
      // Since getSessions is not available in client, show current session only
      setSessions(session ? [session] : []);
    } catch (error) {
      console.error('Erro ao buscar sessão:', error);
      setSessions([]);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await (supabase.auth as any).updateUser({
        data: {
          full_name: profile.full_name,
          role: profile.role,
          timezone: preferences.timezone,
          language: preferences.language,
          mfaEnabled: security.mfaEnabled
        }
      });
      if (error) throw error;
      alert('Perfil atualizado com sucesso!');
    } catch (error: any) {
      alert('Erro ao salvar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword) return alert('Digite uma nova senha.');
    setSaving(true);
    try {
      const { error } = await (supabase.auth as any).updateUser({ password: newPassword });
      if (error) throw error;
      setShowPasswordModal(false);
      setNewPassword('');
      alert('Senha atualizada com sucesso!');
      // Update metadata
      await (supabase.auth as any).updateUser({
        data: { passwordLastChanged: new Date().toLocaleDateString('pt-BR') }
      });
      setSecurity({ ...security, passwordLastChanged: 'Agora' });
    } catch (error: any) {
      alert('Erro ao alterar senha: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleMFA = async () => {
    const newMFA = !security.mfaEnabled;
    setSecurity({ ...security, mfaEnabled: newMFA });
    try {
      await (supabase.auth as any).updateUser({ data: { mfaEnabled: newMFA } });
    } catch (error) {
      console.error('Erro ao atualizar MFA:', error);
    }
  };

  const signOutOthers = async () => {
    try {
      const { error } = await (supabase.auth as any).signOut({ scope: 'others' });
      if (error) throw error;
      alert('Sessões em outros dispositivos encerradas.');
      await fetchSessions();
    } catch (error: any) {
      alert('Erro: ' + error.message);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setSaving(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, { upsert: true });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update user metadata with avatar URL
      await (supabase.auth as any).updateUser({
        data: { avatar_url: publicUrl }
      });

      alert('Foto atualizada com sucesso!');
      // Optionally refresh user data
      await fetchUserData();
    } catch (error: any) {
      alert('Erro ao fazer upload: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const fetchIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('webhook_url')
        .eq('service_name', 'bitrix24')
        .maybeSingle();

      if (error) throw error;
      if (data) setBitrixWebhook(data.webhook_url);
    } catch (error) {
      console.error('Erro ao buscar integrações:', error);
    }
  };

  const handleSaveBitrix = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await (supabase.auth as any).getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('integrations')
        .upsert({
          user_id: user.id,
          service_name: 'bitrix24',
          webhook_url: bitrixWebhook,
          is_active: true
        }, { onConflict: 'user_id, service_name' });


      if (error) throw error;
      alert('Integração com Bitrix24 salva com sucesso!');
    } catch (error: any) {
      alert('Erro ao salvar integração: ' + error.message);
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-12 pb-20">
        <div className="text-center py-20">
          <p className="text-gray-500">Carregando configurações...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20">
      <div>
        <h1 className="text-4xl font-black tracking-tight mb-2">Configurações da Conta</h1>
        <p className="text-gray-500 text-lg">Gerencie suas informações pessoais, preferências locais e protocolos de segurança.</p>
      </div>

      <section className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-8">
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined">account_circle</span>
          <h2 className="text-xl font-bold tracking-tight">Informações do Perfil</h2>
        </div>
        <div className="flex flex-col md:flex-row gap-12">
          <div className="flex flex-col items-center gap-4 shrink-0">
            <div className="size-32 rounded-full border-4 border-slate-50 dark:border-slate-800 bg-center bg-cover shadow-inner overflow-hidden bg-gray-200 dark:bg-gray-700">
              {user?.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-gray-400 text-4xl">account_circle</span>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-bold text-primary hover:underline"
              disabled={saving}
            >
              {saving ? 'Salvando...' : 'Alterar Foto'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*"
              className="hidden"
            />
          </div>
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Nome Completo</label>
              <input
                className="w-full bg-gray-50 dark:bg-slate-800 border-none rounded-lg p-3 text-sm focus:ring-primary"
                placeholder="Seu nome completo"
                value={profile.full_name}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Endereço de E-mail</label>
              <input
                className="w-full bg-gray-50 dark:bg-slate-800 border-none rounded-lg p-3 text-sm focus:ring-primary"
                placeholder="seu@email.com"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                disabled
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-xs font-bold text-gray-500 uppercase">Cargo</label>
              <input
                className="w-full bg-gray-50 dark:bg-slate-800 border-none rounded-lg p-3 text-sm focus:ring-primary"
                placeholder="Ex: Product Designer"
                value={profile.role}
                onChange={(e) => setProfile({ ...profile, role: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="px-6 py-2 bg-primary text-white rounded-lg font-bold hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <section className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col gap-6">
          <div className="flex items-center gap-2 text-primary"><span className="material-symbols-outlined">language</span><h2 className="text-xl font-bold">Preferências</h2></div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Fuso Horário</label>
            <select
              className="w-full bg-gray-50 dark:bg-slate-800 border-none rounded-lg text-sm p-3"
              value={preferences.timezone}
              onChange={(e) => setPreferences({ ...preferences, timezone: e.target.value })}
            >
              <option>(GMT-03:00) America/Sao_Paulo</option>
              <option>(GMT+00:00) Londres</option>
              <option>(GMT-05:00) Nova York</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-gray-500 uppercase">Idioma Padrão</label>
            <select
              className="w-full bg-gray-50 dark:bg-slate-800 border-none rounded-lg text-sm p-3"
              value={preferences.language}
              onChange={(e) => setPreferences({ ...preferences, language: e.target.value })}
            >
              <option>Português (BR)</option>
              <option>English (US)</option>
              <option>Español</option>
            </select>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col gap-6">
          <div className="flex items-center gap-2 text-primary"><span className="material-symbols-outlined">shield_person</span><h2 className="text-xl font-bold">Segurança</h2></div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
              <div className="flex flex-col"><p className="text-sm font-bold">Senha</p><p className="text-xs text-gray-500">{security.passwordLastChanged}</p></div>
              <button
                onClick={() => setShowPasswordModal(true)}
                className="px-4 py-2 border border-primary text-primary text-xs font-bold rounded-lg hover:bg-primary/10"
              >
                Atualizar
              </button>
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
              <div className="flex flex-col"><p className="text-sm font-bold">Autenticação em 2 Fatores</p><p className={`text-xs font-medium ${security.mfaEnabled ? 'text-green-600' : 'text-gray-500'}`}>{security.mfaEnabled ? 'Ativo (SMS)' : 'Inativo'}</p></div>
              <div
                className={`w-10 h-6 rounded-full relative shadow-inner cursor-pointer ${security.mfaEnabled ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`}
                onClick={toggleMFA}
              >
                <div className={`size-4 bg-white rounded-full mt-0.5 transition-all ${security.mfaEnabled ? 'ml-4.5 translate-x-4.5' : 'ml-0.5'}`}></div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm space-y-8">
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined">sync_alt</span>
          <h2 className="text-xl font-bold tracking-tight">Integrações de Terceiros</h2>
        </div>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 p-6 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="size-10 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">B</div>
              <div>
                <h3 className="text-sm font-bold">Bitrix24 Webhook</h3>
                <p className="text-xs text-gray-500 text-pretty">Envie tarefas automaticamente para o Bitrix24 ao criá-las no TaskFlow.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-500 uppercase">URL do Webhook</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-primary outline-none"
                  placeholder="https://sua-empresa.bitrix24.com.br/rest/1/webhook-id/tasks.task.add.json"
                  value={bitrixWebhook}
                  onChange={(e) => setBitrixWebhook(e.target.value)}
                />
                <button
                  onClick={handleSaveBitrix}
                  disabled={saving}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {saving ? '...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 p-8 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2 text-primary"><span className="material-symbols-outlined">devices</span><h2 className="text-xl font-bold">Sessões Ativas</h2></div>
          <button
            onClick={signOutOthers}
            className="text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 px-4 py-2 rounded-lg"
          >
            Encerrar em outros dispositivos
          </button>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {sessions.map((session, index) => (
            <div key={session.id || index} className="py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-gray-400">laptop_mac</span>
                <div>
                  <p className="text-sm font-bold">{session.user_agent || 'Dispositivo Desconhecido'}</p>
                  <p className="text-xs text-gray-500">
                    {session.ip || 'IP Desconhecido'} • {index === 0 ? <span className="text-primary font-medium">Sessão Atual</span> : 'Outra Sessão'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-green-500 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded">Ativo</span>
            </div>
          ))}
        </div>
      </section>

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Alterar Senha</h3>
            <input
              type="password"
              placeholder="Nova senha"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-gray-50 dark:bg-slate-800 border-none rounded-lg p-3 text-sm focus:ring-primary mb-4"
            />
            <div className="flex gap-2">
              <button onClick={handleChangePassword} disabled={saving} className="flex-1 bg-primary text-white py-2 rounded-lg font-bold disabled:opacity-50">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button onClick={() => setShowPasswordModal(false)} className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white py-2 rounded-lg font-bold">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
