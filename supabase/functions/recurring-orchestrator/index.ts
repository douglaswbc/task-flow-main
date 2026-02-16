import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ""
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ""
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const now = new Date()
        const nowISO = now.toISOString()

        const { data: recurringTasks, error: fetchError } = await supabase
            .from('recurring_tasks')
            .select('*')
            .eq('is_active', true)
            .lte('next_run', nowISO)

        if (fetchError) throw fetchError
        if (!recurringTasks || recurringTasks.length === 0) return new Response("No tasks to process", { status: 200 })

        const results = []

        for (const rt of recurringTasks) {
            try {
                let deadline = null
                if (rt.deadline_relative > 0) {
                    deadline = new Date(Date.now() + rt.deadline_relative * 60000).toISOString()
                }

                const { error: createError } = await supabase
                    .from('tasks')
                    .insert({
                        user_id: rt.user_id,
                        title: rt.name,
                        description: rt.description || `Criada via recorrência: ${rt.name}`,
                        status: 'PENDING',
                        origin: 'Recorrente',
                        deadline: deadline,
                        checklist: rt.checklist || [],
                        responsible_id: rt.responsible_id // NEW: Pass the responsible person
                    })

                if (createError) throw createError

                const nextRun = calculateNextRun(rt.type, rt.schedule_time, (rt.days_of_week || []).map(Number), rt.next_run)

                await supabase
                    .from('recurring_tasks')
                    .update({
                        last_run: nowISO,
                        next_run: nextRun.toISOString()
                    })
                    .eq('id', rt.id)

                await supabase.from('automation_logs').insert({
                    user_id: rt.user_id,
                    task_name: rt.name,
                    status: 'Sucesso'
                })

                results.push({ id: rt.id, status: 'success' })

            } catch (err) {
                console.error(`Error processing recurring task ${rt.id}:`, err)
                await supabase.from('automation_logs').insert({
                    user_id: rt.user_id,
                    task_name: rt.name,
                    status: 'Erro',
                    error_message: err.message
                })
                results.push({ id: rt.id, status: 'error', message: err.message })
            }
        }

        return new Response(JSON.stringify(results), { status: 200 })

    } catch (error) {
        console.error("Orchestrator Error:", error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
})

function calculateNextRun(type: string, scheduleTime: string, daysOfWeek: number[], currentNextRun: string) {
    const typeNormalized = type ? type.toUpperCase() : 'DIÁRIO';
    const nextDate = new Date(currentNextRun);

    // Ensure the time part matches schedule_time
    if (scheduleTime) {
        const [hours, minutes, seconds] = scheduleTime.split(':').map(Number);
        nextDate.setHours(hours || 0, minutes || 0, seconds || 0, 0);
    }

    if (typeNormalized === 'DIÁRIO' || typeNormalized === 'DAILY') {
        nextDate.setDate(nextDate.getDate() + 1);
    } else if (typeNormalized === 'SEMANAL' || typeNormalized === 'WEEKLY') {
        nextDate.setDate(nextDate.getDate() + 1);
        let safety = 0;
        const targetDays = daysOfWeek.length > 0 ? daysOfWeek : [nextDate.getDay()];
        while (!targetDays.includes(nextDate.getDay()) && safety < 7) {
            nextDate.setDate(nextDate.getDate() + 1);
            safety++;
        }
    } else if (typeNormalized === 'MENSAL' || typeNormalized === 'MONTHLY') {
        const targetDay = nextDate.getDate();
        nextDate.setMonth(nextDate.getMonth() + 1);
        const lastDayOfNextMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
        nextDate.setDate(Math.min(targetDay, lastDayOfNextMonth));
    }

    // Catch-up logic: if the calculated date is still in the past, move it forward incrementally
    const now = new Date();
    let loopLimit = 0;
    while (nextDate <= now && loopLimit < 50) {
        loopLimit++;
        if (typeNormalized === 'DIÁRIO' || typeNormalized === 'DAILY') {
            nextDate.setDate(nextDate.getDate() + 1);
        } else if (typeNormalized === 'SEMANAL' || typeNormalized === 'WEEKLY') {
            nextDate.setDate(nextDate.getDate() + 7);
        } else if (typeNormalized === 'MENSAL' || typeNormalized === 'MONTHLY') {
            nextDate.setMonth(nextDate.getMonth() + 1);
        } else {
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        }
    }

    return nextDate;
}
