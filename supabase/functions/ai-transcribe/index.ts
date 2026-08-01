import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { buildCors, jsonResponse } from '../_shared/cors.ts'
import { getUser } from '../_shared/auth.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

serve(async (req: Request) => {
  const cors = buildCors(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // La anon key es publica (viaja en el bundle). Sin esto, cualquiera puede
  // gastar la OPENAI_API_KEY del proyecto.
  const user = await getUser(req)
  if (!user) {
    return jsonResponse({ error: 'No autorizado' }, 401, cors)
  }

  if (!checkRateLimit(user.id, 10)) {
    return jsonResponse({ error: 'Too many requests. Try again in a minute.' }, 429, cors)
  }
  try {
    const { audioUrl } = await req.json()

    if (!audioUrl || typeof audioUrl !== 'string') {
      return new Response(JSON.stringify({ error: 'audioUrl is required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const audioResponse = await fetch(audioUrl)
    if (!audioResponse.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch audio file' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const audioBlob = await audioResponse.blob()
    const formData = new FormData()
    formData.append('file', audioBlob, 'audio.webm')
    formData.append('model', 'whisper-1')
    formData.append('language', 'es')
    formData.append('response_format', 'text')

    const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    })

    if (!transcriptionResponse.ok) {
      const error = await transcriptionResponse.text()
      console.error('Whisper API error:', error)
      return new Response(JSON.stringify({ error: 'Transcription failed' }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    const transcript = await transcriptionResponse.text()

    return new Response(JSON.stringify({ transcript }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Function error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
