import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import toast, { Toaster } from 'react-hot-toast';

const Settings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingIntegration, setSavingIntegration] = useState(false);

  // Auth User
  const [user, setUser] = useState<any>(null);

  // Profile State
  const [profile, setProfile] = useState({
    full_name: '',
    avatar_url: '',
    role: ''
  });

  // Integration State (Bitrix24)
  const [integration, setIntegration] = useState({
    id: '',
    webhook_url: '',
    access_code: '',
    is_active: true,
    catalog_automation_active: true
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await (supabase.auth as any).getUser();
      if (!user) return;
      setUser(user);

      // Dispara as duas consultas em paralelo
      const [profileRes, integrationRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('integrations').select('*').eq('user_id', user.id).ilike('service_name', 'bitrix24').maybeSingle()
      ]);

      if (profileRes.data) setProfile(profileRes.data);

      if (integrationRes.data) {
        setIntegration(integrationRes.data);
      } else {
        setIntegration(prev => ({ ...prev, webhook_url: '', access_code: '', catalog_automation_active: true }));
      }

    } catch (error: any) {
      console.error('Erro ao carregar configurações:', error);
      toast.error('Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          full_name: profile.full_name,
          avatar_url: profile.avatar_url,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      toast.success('Perfil atualizado com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao salvar perfil: ' + error.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveIntegration = async () => {
    setSavingIntegration(true);
    try {
      const cleanedWebhook = integration.webhook_url.trim()
        .replace(/\/profile\.json.*/, '')
        .replace(/\/tasks\.task\.add.*/, '')
        .replace(/\/user\.get.*/, '')
        .replace(/\/crm\.deal\.add.*/, '')
        .replace(/\/$/, '');

      if (integration.id) {
        // Update
        const { error } = await supabase
          .from('integrations')
          .update({
            webhook_url: cleanedWebhook,
            access_code: integration.access_code,
            is_active: integration.is_active,
            catalog_automation_active: integration.catalog_automation_active
          })
          .eq('id', integration.id);
        if (error) throw error;
      } else {
        // Create
        const { data, error } = await supabase
          .from('integrations')
          .insert([{
            user_id: user.id,
            service_name: 'bitrix24',
            webhook_url: cleanedWebhook,
            access_code: integration.access_code,
            is_active: true,
            catalog_automation_active: integration.catalog_automation_active
          }])
          .select()
          .single();
        if (error) throw error;
        if (data) setIntegration(data);
      }
      toast.success('Integração salva com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao salvar integração: ' + error.message);
    } finally {
      setSavingIntegration(false);
    }
  };

  const copyPublicUrl = () => {
    const url = window.location.origin + '/import-returns';
    navigator.clipboard.writeText(url);
    toast.success('URL pública copiada!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <Toaster position="top-right" />

      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <span className="bg-primary/10 p-2 rounded-lg text-primary">
              <span className="material-symbols-outlined text-3xl">settings</span>
            </span>
            Configurações
          </h2>
          <p className="text-slate-500 text-sm">Gerencie seu perfil e conexões externas.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* --- PERFIL --- */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 p-2 rounded-xl">person</span>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter">Perfil Pessoal</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
              <input
                type="text"
                className="w-full px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                value={profile.full_name || ''}
                onChange={e => setProfile({ ...profile, full_name: e.target.value })}
                placeholder="Seu nome"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Avatar (URL)</label>
              <input
                type="text"
                className="w-full px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                value={profile.avatar_url || ''}
                onChange={e => setProfile({ ...profile, avatar_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="pt-2">
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="w-full py-3.5 bg-slate-900 dark:bg-emerald-600 text-white font-black rounded-xl hover:opacity-90 active:scale-[0.98] transition-all text-xs uppercase tracking-widest shadow-xl shadow-slate-900/10 disabled:opacity-50"
              >
                {savingProfile ? 'Salvando...' : 'Salvar Perfil'}
              </button>
            </div>
          </div>
        </div>

        {/* --- INTEGRAÇÃO --- */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-blue-500 bg-blue-50 dark:bg-blue-950/20 p-2 rounded-xl">hub</span>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-tighter">Bitrix24 Webhook</h3>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">URL do Webhook</label>
              <input
                type="text"
                className="w-full px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-medium"
                value={integration.webhook_url || ''}
                onChange={e => setIntegration({ ...integration, webhook_url: e.target.value })}
                placeholder="https://loja.bitrix24.com.br/rest/..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Código de Acesso (Importador)</label>
              <div className="relative">
                <input
                  type="text"
                  className="w-full px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all text-sm font-bold tracking-widest uppercase"
                  value={integration.access_code || ''}
                  onChange={e => setIntegration({ ...integration, access_code: e.target.value })}
                  placeholder="LOJA01"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-300 pointer-events-none">vpn_key</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="space-y-0.5">
                <label className="text-sm font-bold text-slate-800 dark:text-white">Automação de Catálogo</label>
                <p className="text-[10px] text-slate-500">Ativar processamento automático de arquivos.</p>
              </div>
              <button
                onClick={() => setIntegration({ ...integration, catalog_automation_active: !integration.catalog_automation_active })}
                className={`w-12 h-6 rounded-full transition-colors relative ${integration.catalog_automation_active ? 'bg-primary' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${integration.catalog_automation_active ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            <div className="pt-2">
              <button
                onClick={handleSaveIntegration}
                disabled={savingIntegration}
                className="w-full py-3.5 bg-primary text-white font-black rounded-xl hover:opacity-90 active:scale-[0.98] transition-all text-xs uppercase tracking-widest shadow-xl shadow-primary/20 disabled:opacity-50"
              >
                {savingIntegration ? 'Salvando...' : 'Salvar Autenticação'}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* --- LINK PÚBLICO TOOL --- */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-950 rounded-3xl p-8 shadow-2xl overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-125 transition-transform duration-1000">
          <span className="material-symbols-outlined text-[120px] text-white">share</span>
        </div>

        <div className="relative z-10 max-w-xl">
          <h4 className="text-xl font-black text-white uppercase tracking-tighter mb-2">Página de Importação Pública</h4>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            Compartilhe este link com operadores ou parceiros que precisam importar devoluções sem precisar de login no painel administrativo.
            <strong> Eles precisarão do Código de Acesso configurado acima.</strong>
          </p>

          <div className="flex gap-4">
            <button
              onClick={copyPublicUrl}
              className="flex items-center gap-2 px-6 py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-100 transition shadow-lg"
            >
              <span className="material-symbols-outlined text-sm">content_copy</span>
              Copiar Link Público
            </button>
            <a
              href="/import-returns"
              target="_blank"
              className="flex items-center gap-2 px-6 py-3 bg-slate-700/50 text-white font-bold rounded-xl hover:bg-slate-700 transition"
            >
              <span className="material-symbols-outlined text-sm">open_in_new</span>
              Acessar Página
            </a>
          </div>
        </div>
      </div>

      <div className="text-center pt-10">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest opacity-50">TaskFlow v2.0 • Sistema de Gestão Inteligente</p>
      </div>

    </div>
  );
};

export default Settings;