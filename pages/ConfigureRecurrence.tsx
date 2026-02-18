import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const ConfigureRecurrence: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editingId = searchParams.get('id'); // Pega o ID da URL se existir

  const [loading, setLoading] = useState(false);
  const [bitrixUsers, setBitrixUsers] = useState<{ id: string; name: string; work_position: string }[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'DIÁRIO',
    schedule_time: '09:00',
    days_of_week: [1], // Segunda por padrão (Inteiros)
    checklist: [] as { title: string; is_completed: boolean }[],
    deadline_relative: 0, // minutos
    next_run: '', // ISO string
    responsible_id: '',
    attachments: [] as {
      name: string;
      url: string;
      type: string;
      size: number;
      storage_path?: string;
    }[]
  });

  const [uploading, setUploading] = useState(false);

  const [newChecklistItem, setNewChecklistItem] = useState('');

  // Carregar dados se estiver em modo de edição
  useEffect(() => {
    fetchBitrixUsers();
    if (editingId) {
      loadAutomationData(editingId);
    }
  }, [editingId]);

  const fetchBitrixUsers = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke('bitrix-users');
      if (!error && data) {
        setBitrixUsers(data);
      }
    } catch (error) {
      console.error('Erro ao buscar usuários do Bitrix:', error);
    }
  };

  const loadAutomationData = async (id: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('recurring_tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Erro ao carregar:', error);
      alert('Automação não encontrada.');
      navigate('/recurring');
    } else if (data) {
      setFormData({
        name: data.name,
        description: data.description || '',
        type: data.type,
        schedule_time: data.schedule_time,
        days_of_week: data.days_of_week || [],
        checklist: data.checklist || [],
        deadline_relative: data.deadline_relative || 0,
        responsible_id: data.responsible_id || '',
        attachments: data.attachments || [],
        next_run: data.next_run ? (() => {
          const d = new Date(data.next_run);
          const pad = (n: number) => n.toString().padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        })() : ''
      });
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) return alert('O nome da automação é obrigatório.');
    if (!formData.next_run) return alert('A próxima execução é obrigatória para definir o horário padrão.');

    setLoading(true);
    try {
      const { data: { user } } = await (supabase.auth as any).getUser();
      if (!user) return alert('Você precisa estar logado.');

      const nextRunDate = new Date(formData.next_run);
      const scheduleTime = `${nextRunDate.getHours().toString().padStart(2, '0')}:${nextRunDate.getMinutes().toString().padStart(2, '0')}`;

      const payload = {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        schedule_time: scheduleTime,
        days_of_week: formData.days_of_week,
        checklist: formData.checklist,
        deadline_relative: formData.deadline_relative,
        responsible_id: formData.responsible_id,
        next_run: nextRunDate.toISOString(),
        attachments: formData.attachments
      };

      let error;

      if (editingId) {
        const { error: updateError } = await supabase
          .from('recurring_tasks')
          .update(payload)
          .eq('id', editingId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('recurring_tasks')
          .insert({
            ...payload,
            user_id: user.id,
            is_active: true
          });
        error = insertError;
      }

      if (error) throw error;
      navigate('/recurring');
    } catch (error: any) {
      alert('Erro ao salvar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day]
    }));
  };

  const addChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    setFormData(prev => ({
      ...prev,
      checklist: [...prev.checklist, { title: newChecklistItem.trim(), is_completed: false }]
    }));
    setNewChecklistItem('');
  };

  const removeChecklistItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      checklist: prev.checklist.filter((_, i) => i !== index)
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const newAttachments = [...formData.attachments];

      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('task-attachments')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('task-attachments')
          .getPublicUrl(filePath);

        newAttachments.push({
          name: file.name,
          url: publicUrl,
          type: file.type,
          size: file.size,
          storage_path: filePath
        });
      }

      setFormData(prev => ({ ...prev, attachments: newAttachments }));
    } catch (error: any) {
      console.error('Erro no upload:', error);
      alert('Erro ao fazer upload do arquivo: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (index: number) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <nav className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <a className="hover:text-primary cursor-pointer" onClick={() => navigate('/recurring')}>Recorrências</a>
        <span className="material-symbols-outlined text-sm">chevron_right</span>
        <span className="text-slate-900 dark:text-white">
          {editingId ? 'Editar Automação' : 'Nova Configuração'}
        </span>
      </nav>

      <div>
        <h1 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
          {editingId ? 'Editar Recorrência' : 'Configurar Recorrência'}
        </h1>
        <p className="text-slate-500 mt-1">
          {editingId ? 'Ajuste os parâmetros desta automação.' : 'Crie automações inteligentes para o seu fluxo de trabalho.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">edit_note</span> Detalhes da Tarefa
            </h3>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nome da Automação</label>
              <input
                className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:ring-primary focus:border-primary px-4 py-3"
                placeholder="Ex: Backup Semanal, Relatórios..."
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Descrição (Opcional)</label>
              <textarea
                className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:ring-primary focus:border-primary px-4 py-3 min-h-[100px]"
                placeholder="Explique o que esta automação faz..."
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              ></textarea>
            </div>
          </section>

          <section className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">event_repeat</span> Lógica de Recorrência
            </h3>
            <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
              {['DIÁRIO', 'SEMANAL', 'MENSAL'].map(type => (
                <button
                  key={type}
                  onClick={() => setFormData({ ...formData, type })}
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${formData.type === type ? 'bg-primary text-white shadow-md' : 'text-slate-500'}`}
                >
                  {type.charAt(0) + type.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            {formData.type === 'SEMANAL' && (
              <div className="space-y-4 pt-4">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Selecione os Dias</label>
                <div className="flex flex-wrap gap-2">
                  {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                    <button
                      key={i}
                      onClick={() => toggleDay(i)}
                      className={`size-10 rounded-lg flex items-center justify-center font-bold text-sm transition-all ${formData.days_of_week.includes(i) ? 'bg-primary text-white scale-105' : 'bg-slate-100 dark:bg-slate-900 text-slate-400'}`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">checklist</span> Checklist Padrão
            </h3>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-2 text-sm"
                placeholder="Adicionar item ao checklist..."
                value={newChecklistItem}
                onChange={e => setNewChecklistItem(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addChecklistItem()}
              />
              <button
                onClick={addChecklistItem}
                className="bg-primary/10 text-primary p-2 rounded-lg hover:bg-primary/20"
              >
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>
            <div className="space-y-2">
              {formData.checklist.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg group">
                  <span className="text-sm">{item.title}</span>
                  <button
                    onClick={() => removeChecklistItem(index)}
                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                </div>
              ))}
            </div>
          </section>
          <section className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">attach_file</span> Anexos Padrão
            </h3>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer transition-all">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <span className="material-symbols-outlined text-slate-400 text-3xl mb-2">cloud_upload</span>
                    <p className="text-sm text-slate-500 font-medium">Clique para fazer upload ou arraste</p>
                    <p className="text-xs text-slate-400 mt-1">PDF, PNG, JPG, ZIP (Máx. 10MB)</p>
                  </div>
                  <input type="file" className="hidden" multiple onChange={handleFileUpload} disabled={uploading} />
                </label>
              </div>

              {uploading && (
                <div className="flex items-center gap-3 text-sm text-primary animate-pulse">
                  <span className="material-symbols-outlined spin">sync</span>
                  <span>Fazendo upload dos arquivos...</span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                {formData.attachments.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg group border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-slate-400">description</span>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
                        <span className="text-[10px] text-slate-500">{(file.size / 1024).toFixed(1)} KB</span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeAttachment(index)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">schedule</span> Agendamento
            </h3>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Responsável no Bitrix24</label>
              <div className="relative">
                <select
                  className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3 appearance-none"
                  value={formData.responsible_id}
                  onChange={e => setFormData({ ...formData, responsible_id: e.target.value })}
                >
                  <option value="">Selecione um responsável...</option>
                  {bitrixUsers.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name} {user.work_position ? `(${user.work_position})` : ''}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-3.5 text-slate-400 pointer-events-none">person</span>
              </div>
              <p className="text-[10px] text-slate-400 italic">Este usuário será definido como o responsável pela tarefa no Bitrix24.</p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Próxima Execução (Opcional)</label>
              <div className="relative">
                <input
                  className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3"
                  type="datetime-local"
                  value={formData.next_run}
                  onChange={e => setFormData({ ...formData, next_run: e.target.value })}
                />
                <span className="material-symbols-outlined absolute right-3 top-3.5 text-slate-400">calendar_month</span>
              </div>
              <p className="text-[10px] text-slate-400 italic">Defina manualmente quando esta tarefa deve ser executada pela primeira vez ou na próxima vez.</p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Prazo para Conclusão (em horas)</label>
              <div className="relative">
                <input
                  className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3"
                  type="number"
                  min="0"
                  value={formData.deadline_relative / 60}
                  onChange={e => setFormData({ ...formData, deadline_relative: Number(e.target.value) * 60 })}
                />
                <span className="material-symbols-outlined absolute right-3 top-3.5 text-slate-400">timer</span>
              </div>
              <p className="text-[10px] text-slate-400 italic">As tarefas criadas terão um prazo de vencimento baseado neste valor.</p>
            </div>
          </section>

          <section className="bg-gradient-to-br from-primary/10 to-white dark:to-slate-800 p-6 rounded-xl border border-primary/10 shadow-sm">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">Resumo da Automação</h3>
            <div className="flex gap-4">
              <div className="size-12 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0"><span className="material-symbols-outlined">auto_awesome</span></div>
              <div className="space-y-2">
                <p className="text-base font-semibold leading-snug">
                  \"Sua tarefa <span className="text-primary font-bold">{formData.name || 'Sem Nome'}</span> será {editingId ? 'atualizada' : 'criada'} conforme a agenda.\"
                </p>
                <p className="text-xs text-slate-500 italic">
                  {editingId ? 'As alterações entrarão em vigor imediatamente.' : 'O sistema irá calcular a próxima execução assim que você salvar.'}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <span className="material-symbols-outlined text-lg">info</span>
          <span>Certifique-se de que os dados estão corretos antes de salvar.</span>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button onClick={() => navigate('/recurring')} className="px-6 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 transition-colors">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-8 py-2.5 bg-primary text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : (editingId ? 'Atualizar Automação' : 'Criar Automação')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigureRecurrence;