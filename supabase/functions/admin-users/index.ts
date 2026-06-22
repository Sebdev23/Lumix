import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fail(error: string) {
  return ok({ success: false, error })
}

const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')
const PROJECT_URL = Deno.env.get('PROJECT_URL')

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!SERVICE_ROLE_KEY || !PROJECT_URL) {
      return fail(
        'Edge function not configured: SERVICE_ROLE_KEY and PROJECT_URL must be set in Supabase dashboard > Edge Functions > admin-users > Settings > Environment Variables',
      )
    }

    const body = await req.json()
    const { action, email, fullName, role, teamId, userId } = body
    const password = body.password || `Opera${Math.random().toString(36).slice(2, 8)}!`

    if (action === 'create-user') {
      if (!email || !fullName) {
        return fail('Email y nombre requeridos')
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
        return fail('Auth API: ' + parsed)
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
        console.error('Profile update failed:', await profileRes.text())
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
          console.error('Team member insert failed:', await memberRes.text())
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
          console.error('Profile team update failed:', await teamRes.text())
        }
      }

      return ok({ success: true, user: { id: userId2, email }, password })
    }

    if (action === 'change-role') {
      if (!userId || !teamId || !role) {
        return fail('userId, teamId, role requeridos')
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
        return fail('Update failed: ' + (await res.text()))
      }

      return ok({ success: true })
    }

    return fail('Accion desconocida')
  } catch (err) {
    return fail('Error interno: ' + String(err))
  }
})
