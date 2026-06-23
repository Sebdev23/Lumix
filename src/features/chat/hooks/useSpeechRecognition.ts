import { useState, useRef, useCallback } from 'react'

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionResultItem {
  isFinal: boolean
  0: SpeechRecognitionAlternative
  length: number
}

interface SpeechRecognitionResultEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultItem[]
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface UseSpeechResult {
  isListening: boolean
  isSupported: boolean
  startListening: () => void
  stopListening: () => void
  transcript: string
  error: string | null
}

function getRecognitionConstructor(): { new (): SpeechRecognitionInstance } | undefined {
  const win = window as unknown as Record<string, unknown>
  const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition
  return Ctor as { new (): SpeechRecognitionInstance } | undefined
}

export function useSpeechRecognition(language = 'es-CL'): UseSpeechResult {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const SpeechRecognitionCtor = getRecognitionConstructor()
  const isSupported = !!SpeechRecognitionCtor

  const startListening = useCallback(() => {
    if (!SpeechRecognitionCtor) {
      setError('Reconocimiento de voz no soportado en este navegador')
      return
    }

    setError(null)
    setTranscript('')

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = language
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      let final = ''
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript
        } else {
          interim += result[0].transcript
        }
      }
      setTranscript(final + interim)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') return
      setError(
        event.error === 'not-allowed' ? 'Permiso de microfono denegado' : `Error: ${event.error}`,
      )
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [SpeechRecognitionCtor, language])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  return { isListening, isSupported, startListening, stopListening, transcript, error }
}
