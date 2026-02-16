import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
    try {
        const { record, old_record, type, table, schema } = await req.json()

        if (table !== 'tasks' || schema !== 'public') {
            return new Response("Not a task event", { status: 200 })
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ""
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ""
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const userId = record.user_id || (old_record && old_record.user_id)
        if (!userId) return new Response("No user_id found", { status: 200 })

        // 1. RECURSION PREVENTION: If it's an UPDATE and only external_id changed, ignore.
        if (type === 'UPDATE' && record.external_id && old_record && !old_record.external_id) {
            const keys = Object.keys(record)
            const changedKeys = keys.filter(key => record[key] !== old_record[key])
            if (changedKeys.length === 1 && changedKeys[0] === 'external_id') {
                return new Response("Update triggered by external_id sync, ignoring", { status: 200 })
            }
        }

        // Anti-duplication check for manual inserts
        if (type === 'INSERT' && record.origin !== 'Recorrente') {
            const { data: recentLogs } = await supabase
                .from('automation_logs')
                .select('id')
                .eq('user_id', userId)
                .eq('task_name', record.title)
                .gt('execution_date', new Date(Date.now() - 5000).toISOString())
                .limit(1)

            if (recentLogs && recentLogs.length > 0) {
                return new Response("Duplicate sync ignored", { status: 200 })
            }
        }

        const { data: integration, error: intError } = await supabase
            .from('integrations')
            .select('webhook_url, is_active')
            .eq('user_id', userId)
            .eq('service_name', 'bitrix24')
            .maybeSingle()

        if (intError || !integration || !integration.is_active) {
            return new Response("Service not active or no integration found", { status: 200 })
        }

        // Clean webhook URL
        let baseWebhookUrl = integration.webhook_url.replace(/\/$/, "")
        const methodsToRemove = [
            'tasks.task.add.json',
            'tasks.task.update.json',
            'tasks.task.delete.json',
            'tasks.task.get.json'
        ]
        for (const method of methodsToRemove) {
            if (baseWebhookUrl.endsWith(method)) {
                baseWebhookUrl = baseWebhookUrl.replace(new RegExp(`/${method}$`), "")
            }
        }
        if (baseWebhookUrl.includes('.json')) {
            baseWebhookUrl = baseWebhookUrl.substring(0, baseWebhookUrl.lastIndexOf('/'))
        }

        console.log(`Using base URL: ${baseWebhookUrl} for sync type ${type}`)

        // Function to format deadline for Bitrix
        const formatBitrixDate = (dateString: string | null) => {
            if (!dateString) return null;
            try {
                const date = new Date(dateString);
                // Bitrix prefers ISO 8601 without milliseconds or with timezone offset
                return date.toISOString().split('.')[0] + '+00:00';
            } catch (e) {
                return null;
            }
        }

        if (type === 'INSERT') {
            const bitrixPayload = {
                fields: {
                    TITLE: record.title,
                    DESCRIPTION: record.description || "",
                    PRIORITY: record.is_high_priority ? "2" : "1",
                    DEADLINE: formatBitrixDate(record.deadline),
                    RESPONSIBLE_ID: record.responsible_id ? parseInt(record.responsible_id, 10) : null
                }
            }

            const response = await fetch(`${baseWebhookUrl}/tasks.task.add.json`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bitrixPayload)
            })

            const result = await response.json()
            const bitrixTaskId = result.result?.task?.id

            if (bitrixTaskId) {
                // This update might trigger the function again (handled by recursion check)
                await supabase.from('tasks').update({ external_id: bitrixTaskId.toString() }).eq('id', record.id)

                // SYNC CHECKLIST
                if (record.checklist && Array.isArray(record.checklist) && record.checklist.length > 0) {
                    for (const item of record.checklist) {
                        try {
                            await fetch(`${baseWebhookUrl}/task.checklistitem.add.json`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    TASKID: bitrixTaskId,
                                    FIELDS: {
                                        TITLE: item.title || item.text || "Item", // Support both title and text
                                        IS_COMPLETE: item.is_completed || item.completed ? 'Y' : 'N'
                                    }
                                })
                            })
                        } catch (e) {
                            console.error("Checklist Sync Error:", e)
                        }
                    }
                }
            }

            await supabase.from('automation_logs').insert({
                user_id: userId,
                task_name: record.title,
                status: (response.ok && !result.error) ? 'Sucesso' : 'Erro',
                error_message: (response.ok && !result.error) ? null : (result.error_description || JSON.stringify(result))
            })

            return new Response(JSON.stringify(result), { status: 200 })

        } else if (type === 'UPDATE' && record.external_id) {
            const bitrixPayload = {
                taskId: record.external_id,
                fields: {
                    TITLE: record.title,
                    DESCRIPTION: record.description || "",
                    PRIORITY: record.is_high_priority ? "2" : "1",
                    DEADLINE: formatBitrixDate(record.deadline),
                    STATUS: record.status === 'COMPLETED' ? 5 : 2,
                    RESPONSIBLE_ID: record.responsible_id ? parseInt(record.responsible_id, 10) : null
                }
            }

            const response = await fetch(`${baseWebhookUrl}/tasks.task.update.json`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bitrixPayload)
            })

            const result = await response.json()

            // Log update attempt
            if (!response.ok || result.error) {
                await supabase.from('automation_logs').insert({
                    user_id: userId,
                    task_name: record.title + " (Update)",
                    status: 'Erro',
                    error_message: result.error_description || JSON.stringify(result)
                })
            }

            return new Response(JSON.stringify(result), { status: 200 })

        } else if (type === 'DELETE' && record.external_id) {
            const response = await fetch(`${baseWebhookUrl}/tasks.task.delete.json`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId: record.external_id })
            })

            const result = await response.json()
            return new Response(JSON.stringify(result), { status: 200 })
        }

        return new Response("No action taken", { status: 200 })

    } catch (error) {
        console.error("Function Error:", error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
})
