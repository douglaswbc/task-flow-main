import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ""
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ""
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Find the user integration
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return new Response(JSON.stringify({ error: "Invalid token", details: authError }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const { data: integration, error: intError } = await supabase
            .from('integrations')
            .select('webhook_url, is_active')
            .eq('user_id', user.id)
            .eq('service_name', 'bitrix24')
            .maybeSingle()

        if (intError || !integration || !integration.is_active) {
            return new Response(JSON.stringify([]), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        let baseWebhookUrl = integration.webhook_url.replace(/\/$/, "")
        const methodsToRemove = [
            'tasks.task.add.json',
            'tasks.task.update.json',
            'tasks.task.delete.json',
            'tasks.task.get.json',
            'user.get.json'
        ]

        for (const method of methodsToRemove) {
            if (baseWebhookUrl.endsWith(method)) {
                baseWebhookUrl = baseWebhookUrl.replace(new RegExp(`/${method}$`), "")
            }
        }

        if (baseWebhookUrl.includes('.json')) {
            baseWebhookUrl = baseWebhookUrl.substring(0, baseWebhookUrl.lastIndexOf('/'))
        }

        console.log(`Fetching Bitrix24 users from: ${baseWebhookUrl}/user.get.json`)

        const response = await fetch(`${baseWebhookUrl}/user.get.json`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        })

        const result = await response.json()

        if (response.ok && result.result) {
            const users = result.result.map((u: any) => ({
                id: u.ID,
                name: `${u.NAME} ${u.LAST_NAME}`.trim(),
                work_position: u.WORK_POSITION
            }))
            return new Response(JSON.stringify(users), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            })
        }

        return new Response(JSON.stringify({ error: "Failed to fetch users", details: result }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        })

    } catch (error) {
        console.error("Fetch Users Error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
    }
})
