import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')
const PROJECT_URL = Deno.env.get('PROJECT_URL')

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!SERVICE_ROLE_KEY || !PROJECT_URL) {
      return new Response(
        JSON.stringify({
          error:
            'Edge function not configured: SERVICE_ROLE_KEY and PROJECT_URL must be set in Supabase dashboard > Edge Functions > admin-users > Settings > Environment Variables',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const body = await req.json()
    const { action, email, fullName, role, teamId, userId } = body
    const password = body.password || `Opera${Math.random().toString(36).slice(2, 8)}!`

    if (action === 'create-user') {
      if (!email || !fullName) {
        return new Response(JSON.stringify({ error: 'Email y nombre requeridos' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const authResponse = await fetch(`${PROJECT_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, must_change_password: true },
        }),
      })

      if (!authResponse.ok) {
        const errText = await authResponse.text()
        let parsed: string
        try {
          const j = JSON.parse(errText)
          parsed = j.msg || j.message || j.error_description || errText
        } catch {
          parsed = errText
        }
        return new Response(JSON.stringify({ error: 'Auth API: ' + parsed }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const authUser = await authResponse.json()
      const userId2 = authUser.id

      const profileRes = await fetch(`${PROJECT_URL}/rest/v1/profiles?id=eq.${userId2}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          apikey: SERVICE_ROLE_KEY,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ role: role || 'colaborador' }),
      })

      if (!profileRes.ok) {
        return new Response(
          JSON.stringify({ error: 'Failed to set profile role: ' + (await profileRes.text()) }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      if (teamId) {
        const memberRes = await fetch(`${PROJECT_URL}/rest/v1/team_members`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            apikey: SERVICE_ROLE_KEY,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ team_id: teamId, user_id: userId2, role: role || 'colaborador' }),
        })

        if (!memberRes.ok) {
          return new Response(
            JSON.stringify({ error: 'Failed to add team member: ' + (await memberRes.text()) }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          )
        }

        const teamRes = await fetch(`${PROJECT_URL}/rest/v1/profiles?id=eq.${userId2}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            apikey: SERVICE_ROLE_KEY,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ team_id: teamId }),
        })

        if (!teamRes.ok) {
          return new Response(
            JSON.stringify({ error: 'Failed to set team: ' + (await teamRes.text()) }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          )
        }
      }

      return new Response(
        JSON.stringify({ success: true, user: { id: userId2, email }, password }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    if (action === 'change-role') {
      if (!userId || !teamId || !role) {
        return new Response(JSON.stringify({ error: 'userId, teamId, role requeridos' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const res = await fetch(
        `${PROJECT_URL}/rest/v1/team_members?team_id=eq.${teamId}&user_id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            apikey: SERVICE_ROLE_KEY,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ role }),
        },
      )

      if (!res.ok) {
        return new Response(JSON.stringify({ error: 'Update failed: ' + (await res.text()) }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Accion desconocida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Catch: ' + String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
