import { useState, useRef, useCallback } from 'react'

interface UseVoiceInputResult {
  isListening: boolean
  isSupported: boolean
  startListening: () => void
  stopListening: () => Promise<Blob | null>
  transcript: string
  error: string | null
}

function getSpeechCtor() {
  const win = window as unknown as Record<string, unknown>
  return (win.SpeechRecognition || win.webkitSpeechRecognition) as
    | { new (): SpeechRecognitionInstance }
    | undefined
}

interface SpeechRecognitionInstance {
  start(): void
  stop(): void
  abort(): void
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult:
    | ((e: {
        resultIndex: number
        results: { isFinal: boolean; 0: { transcript: string } }[]
      }) => void)
    | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

const hasMediaRecorder =
  typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export function useSpeechRecognition(language = 'es-CL'): UseVoiceInputResult {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null)

  const SpeechCtor = getSpeechCtor()
  const isSupported = !!SpeechCtor || !!hasMediaRecorder

  const stopListening = useCallback((): Promise<Blob | null> => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
      return Promise.resolve(null)
    }

    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null)
        return
      }
      resolveRef.current = (blob) => {
        setIsListening(false)
        resolve(blob)
      }
      mediaRecorderRef.current.stop()
    })
  }, [])

  const startRecord = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (resolveRef.current) {
          resolveRef.current(blob)
          resolveRef.current = null
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsListening(true)
    } catch {
      setError('No se pudo acceder al microfono. Verifica los permisos.')
      setIsListening(false)
    }
  }, [])

  const startListening = useCallback(() => {
    setError(null)
    setTranscript('')
    chunksRef.current = []

    if (SpeechCtor) {
      const recognition = new SpeechCtor()
      recognition.lang = language
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      recognition.onresult = (e) => {
        let final = ''
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) final += r[0].transcript
          else interim += r[0].transcript
        }
        setTranscript(final + interim)
      }

      recognition.onerror = (e) => {
        if (e.error === 'no-speech') return
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          if (hasMediaRecorder) {
            startRecord()
            return
          }
          setError(
            'Microfono bloqueado. Permitilo en configuracion del navegador > Privacidad > Microfono.',
          )
        } else {
          setError(`Error de voz: ${e.error}. Intenta de nuevo.`)
        }
        setIsListening(false)
      }

      recognition.onend = () => setIsListening(false)

      recognitionRef.current = recognition
      recognition.start()
      setIsListening(true)
    } else if (hasMediaRecorder) {
      startRecord()
    } else {
      setError('Reconocimiento de voz no soportado en este navegador')
    }
  }, [SpeechCtor, language, startRecord])

  return { isListening, isSupported, startListening, stopListening, transcript, error }
}
