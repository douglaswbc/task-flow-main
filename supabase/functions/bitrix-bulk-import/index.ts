import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { items, webhookUrl, operatorInstructions } = await req.json()

        if (!items || !Array.isArray(items)) {
            throw new Error('Items must be an array')
        }

        if (!webhookUrl) {
            throw new Error('webhookUrl is required')
        }

        const baseApiUrl = webhookUrl.replace(/\/tasks\.task\.add.*/, '').replace(/\/user\.get.*/, '').replace(/\/$/, '');
        const dealAddUrl = `${baseApiUrl}/crm.deal.add`;
        const commentUrl = `${baseApiUrl}/crm.timeline.comment.add`;

        const results = []
        const startTime = Date.now()
        const MAX_DURATION = 50000 // 50 seconds to be safe (60s limit)

        for (let i = 0; i < items.length; i++) {
            // Check for timeout
            if (Date.now() - startTime > MAX_DURATION) {
                return new Response(
                    JSON.stringify({
                        status: 'partial',
                        processed: results.length,
                        total: items.length,
                        results,
                        message: 'Time limit reached. Please resume for remaining items.'
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                )
            }

            const item = items[i]

            try {
                const response = await fetch(dealAddUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fields: item.fields })
                })

                const data = await response.json()

                if (data.result) {
                    // Add comment
                    await fetch(commentUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            fields: {
                                ENTITY_ID: data.result,
                                ENTITY_TYPE: 'DEAL',
                                COMMENT: operatorInstructions
                            }
                        })
                    })

                    results.push({ orderId: item.orderId, success: true, id: data.result })
                } else {
                    results.push({ orderId: item.orderId, success: false, error: data.error_description || 'Unknown error' })
                }
            } catch (err) {
                results.push({ orderId: item.orderId, success: false, error: err.message })
            }

            // Staggering: 500ms delay between requests
            if (i < items.length - 1) {
                await new Promise(r => setTimeout(r, 500))
            }
        }

        return new Response(
            JSON.stringify({ status: 'completed', results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
