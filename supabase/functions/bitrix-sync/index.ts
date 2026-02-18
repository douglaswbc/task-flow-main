import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"

serve(async (req) => {
    try {
        const { record, old_record, type, table, schema } = await req.json()

        if (table !== 'tasks' || schema !== 'public') {
            return new Response("Not a task event", { status: 200 })
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ""
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ""
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const userId = (record && record.user_id) || (old_record && old_record.user_id)
        if (!userId) {
            console.error("[bitrix-sync] No user_id found in record or old_record")
            return new Response("No user_id found", { status: 200 })
        }

        // 1. RECURSION PREVENTION: If it's an UPDATE and only external_id changed, ignore.
        if (type === 'UPDATE' && record.external_id && old_record && !old_record.external_id) {
            const keys = Object.keys(record)
            const ignoredKeys = ['updated_at', 'external_id']
            const changedKeys = keys.filter(key => record[key] !== old_record[key] && !ignoredKeys.includes(key))
            if (changedKeys.length === 0) {
                console.log(`[bitrix-sync] Ignoring redundant update for task ${record.external_id}`)
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

        // Function to sync attachments to Bitrix Drive
        const syncAttachments = async (attachments: any[], taskTitle: string) => {
            const driveFileIds: string[] = []
            const updatedAttachments = [...attachments]

            if (attachments && Array.isArray(attachments) && attachments.length > 0) {
                console.log(`[bitrix-sync] Processing ${attachments.length} attachments for task "${taskTitle}"`)
                for (let i = 0; i < attachments.length; i++) {
                    const file = attachments[i]
                    if (file.bitrix_file_id) {
                        driveFileIds.push(`n${file.bitrix_file_id}`)
                        continue
                    }

                    try {
                        console.log(`[bitrix-sync] Downloading file: ${file.name} from ${file.url}`)
                        const fileResp = await fetch(file.url)
                        if (!fileResp.ok) throw new Error(`Failed to download file from Supabase: ${fileResp.statusText}`)

                        const arrayBuffer = await fileResp.arrayBuffer()
                        const base64Content = encode(new Uint8Array(arrayBuffer))

                        const timestamp = Date.now();
                        const uniqueName = `${timestamp}_${file.name}`;

                        console.log(`[bitrix-sync] Uploading to Bitrix24 Drive: ${uniqueName}`)
                        const uploadResp = await fetch(`${baseWebhookUrl}/disk.folder.uploadfile.json`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                id: 1, // Default root folder
                                data: { NAME: uniqueName },
                                fileContent: [uniqueName, base64Content]
                            })
                        })

                        const uploadResult = await uploadResp.json()
                        if (uploadResult.result && uploadResult.result.ID) {
                            console.log(`[bitrix-sync] File uploaded successfully. Bitrix ID: ${uploadResult.result.ID}`)
                            const bitrixId = uploadResult.result.ID.toString()
                            driveFileIds.push(`n${bitrixId}`)
                            updatedAttachments[i] = { ...file, bitrix_file_id: bitrixId }
                        } else {
                            console.error(`[bitrix-sync] Upload failed for ${file.name}:`, uploadResult.error_description || JSON.stringify(uploadResult))
                        }
                    } catch (e) {
                        console.error(`[bitrix-sync] Error processing attachment ${file.name}:`, e.message)
                    }
                }
            }
            return { driveFileIds, updatedAttachments }
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

            // --- SYNC ATTACHMENTS ---
            const { driveFileIds, updatedAttachments } = await syncAttachments(record.attachments, record.title)
            if (driveFileIds.length > 0) {
                // @ts-ignore
                bitrixPayload.fields.UF_TASK_WEBDAV_FILES = driveFileIds
            }

            console.log(`[bitrix-sync] Sending payload to tasks.task.add.json`)
            const response = await fetch(`${baseWebhookUrl}/tasks.task.add.json`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bitrixPayload)
            })

            const result = await response.json()
            const bitrixTaskId = result.result?.task?.id

            if (bitrixTaskId) {
                const domainMatch = baseWebhookUrl.match(/https:\/\/(.*?)\/rest\/(.*?)\//)
                const domain = domainMatch ? domainMatch[1] : 'bitrix24.com'
                const bitrixUserId = domainMatch ? domainMatch[2] : '1'
                const taskUrl = `https://${domain}/company/personal/user/${bitrixUserId}/tasks/task/view/${bitrixTaskId}/`

                console.log(`[bitrix-sync] Task created in Bitrix24. ID: ${bitrixTaskId}`)
                console.log(`[bitrix-sync] Task URL: ${taskUrl}`)

                // This update might trigger the function again (handled by recursion check)
                await supabase.from('tasks').update({
                    external_id: bitrixTaskId.toString(),
                    attachments: updatedAttachments
                }).eq('id', record.id)

                // SYNC CHECKLIST
                if (record.checklist && Array.isArray(record.checklist) && record.checklist.length > 0) {
                    console.log(`[bitrix-sync] Syncing ${record.checklist.length} checklist items`)
                    for (const item of record.checklist) {
                        try {
                            await fetch(`${baseWebhookUrl}/task.checklistitem.add.json`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    TASKID: bitrixTaskId,
                                    FIELDS: {
                                        TITLE: item.title || item.text || "Item",
                                        IS_COMPLETE: item.is_completed || item.completed ? 'Y' : 'N'
                                    }
                                })
                            })
                        } catch (e) {
                            console.error("[bitrix-sync] Checklist Sync Error:", e)
                        }
                    }
                }
            } else {
                console.error(`[bitrix-sync] Bitrix24 Task Creation Error:`, result.error_description || JSON.stringify(result))
            }

            await supabase.from('automation_logs').insert({
                user_id: userId,
                task_name: record.title,
                status: (response.ok && !result.error) ? 'Sucesso' : 'Erro',
                error_message: (response.ok && !result.error) ? null : (result.error_description || JSON.stringify(result))
            })

            return new Response(JSON.stringify(result), { status: 200 })

        } else if (type === 'UPDATE' && record.external_id) {
            console.log(`[bitrix-sync] Updating existing task ${record.external_id}`)
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

            // --- SYNC ATTACHMENTS ON UPDATE ---
            const attachmentsChanged = JSON.stringify(record.attachments) !== JSON.stringify(old_record.attachments)
            let updatedAttachments = record.attachments
            if (attachmentsChanged && record.attachments && record.attachments.length > 0) {
                console.log(`[bitrix-sync] Attachments changed on update, syncing...`)
                const syncResult = await syncAttachments(record.attachments, record.title)
                updatedAttachments = syncResult.updatedAttachments
                if (syncResult.driveFileIds.length > 0) {
                    // @ts-ignore
                    bitrixPayload.fields.UF_TASK_WEBDAV_FILES = syncResult.driveFileIds
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
                console.error(`[bitrix-sync] Bitrix24 Task Update Error:`, result.error_description || JSON.stringify(result))
                await supabase.from('automation_logs').insert({
                    user_id: userId,
                    task_name: record.title + " (Update)",
                    status: 'Erro',
                    error_message: result.error_description || JSON.stringify(result)
                })
            } else {
                const domainMatch = baseWebhookUrl.match(/https:\/\/(.*?)\/rest\/(.*?)\//)
                const domain = domainMatch ? domainMatch[1] : 'bitrix24.com'
                const bitrixUserId = domainMatch ? domainMatch[2] : '1'
                const taskUrl = `https://${domain}/company/personal/user/${bitrixUserId}/tasks/task/view/${record.external_id}/`
                console.log(`[bitrix-sync] Task ${record.external_id} updated successfully. URL: ${taskUrl}`)

                // Persist updated attachments with Bitrix IDs
                if (attachmentsChanged) {
                    await supabase.from('tasks').update({ attachments: updatedAttachments }).eq('id', record.id)
                }
            }

            return new Response(JSON.stringify(result), { status: 200 })

        } else if (type === 'DELETE' && old_record && old_record.external_id) {
            console.log(`[bitrix-sync] Deleting task ${old_record.external_id} from Bitrix24`)

            // --- CLEANUP ATTACHMENTS ---
            if (old_record.attachments && Array.isArray(old_record.attachments) && old_record.attachments.length > 0) {
                console.log(`[bitrix-sync] Cleaning up ${old_record.attachments.length} attachments for deleted task`)
                for (const file of old_record.attachments) {
                    try {
                        // 1. Delete from Supabase Storage
                        if (file.storage_path) {
                            console.log(`[bitrix-sync] Deleting from Supabase Storage: ${file.storage_path}`)
                            await supabase.storage.from('task-attachments').remove([file.storage_path])
                        }

                        // 2. Delete from Bitrix24 Drive
                        if (file.bitrix_file_id) {
                            console.log(`[bitrix-sync] Deleting from Bitrix24 Drive: ${file.bitrix_file_id}`)
                            await fetch(`${baseWebhookUrl}/disk.item.delete.json`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: file.bitrix_file_id })
                            })
                        }
                    } catch (cleanupError) {
                        console.error(`[bitrix-sync] Cleanup Error for ${file.name}:`, cleanupError)
                    }
                }
            }

            const response = await fetch(`${baseWebhookUrl}/tasks.task.delete.json`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taskId: old_record.external_id })
            })

            const result = await response.json()
            console.log(`[bitrix-sync] Delete result:`, JSON.stringify(result))
            return new Response(JSON.stringify(result), { status: 200 })
        }

        return new Response("No action taken", { status: 200 })

    } catch (error) {
        console.error("Function Error:", error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
})
