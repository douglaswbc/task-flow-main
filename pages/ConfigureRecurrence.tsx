import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const ConfigureRecurrence: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editingId = searchParams.get('id'); // Pega o ID da URL se existir

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    days_of_week: [1], // Segunda por padrão (Inteiros)
    checklist: [] as { title: string; is_completed: boolean }[],
    deadline_relative: 0 // minutos
  });

  const [newChecklistItem, setNewChecklistItem] = useState('');

  // Carregar dados se estiver em modo de edição
  useEffect(() => {
    if (editingId) {
      loadAutomationData(editingId);
    }
  }, [editingId]);

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
        deadline_relative: data.deadline_relative || 0
      });
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!formData.name) return alert('Por favor, dê um nome para a tarefa.');

    setLoading(true);
    try {
      const { data: { user } } = await (supabase.auth as any).getUser();
      if (!user) return alert('Você precisa estar logado.');

      // Objeto base dos dados
      const taskData = {
        name: formData.name,
        description: formData.description,
        type: formData.type,
        schedule_time: formData.schedule_time,
        days_of_week: formData.days_of_week,
        checklist: formData.checklist,
        deadline_relative: formData.deadline_relative
      };

      let error;

      if (editingId) {
        // MODO EDIÇÃO: Atualiza (Update)
        const { error: updateError } = await supabase
          .from('recurring_tasks')
          .update(taskData) // Não atualizamos user_id nem is_active aqui para manter estado
          .eq('id', editingId);
        error = updateError;
      } else {
        // MODO CRIAÇÃO: Insere (Insert)
        const { error: insertError } = await supabase
          .from('recurring_tasks')
          .insert({
            ...taskData,
            user_id: user.id,
            is_active: true // Padrão ativo ao criar
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
        </div>

        <div className="lg:col-span-5 space-y-6">
          <section className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">schedule</span> Agendamento
            </h3>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Horário de Execução</label>
              <div className="relative">
                <input
                  className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3"
                  type="time"
                  value={formData.schedule_time}
                  onChange={e => setFormData({ ...formData, schedule_time: e.target.value })}
                />
                <span className="material-symbols-outlined absolute right-3 top-3.5 text-slate-400">schedule</span>
              </div>
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
                  "Sua tarefa <span className="text-primary font-bold">{formData.name || 'Sem Nome'}</span> será {editingId ? 'atualizada' : 'criada'} conforme a agenda."
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