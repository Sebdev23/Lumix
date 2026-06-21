import { useState, useEffect, useRef } from 'react'
import { supabase } from '@infrastructure/supabase/client'
import { useAuth } from '@core/auth/hooks/useAuth'

interface TypingUser {
  id: string
  name: string
}

export function useTypingIndicator() {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const { user, profile } = useAuth()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const channel = supabase.channel('typing-indicator', {
      config: {
        broadcast: { self: false },
      },
    })

    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { userId, userName } = payload.payload as { userId: string; userName: string }
        setTypingUsers((prev) => {
          if (prev.some((u) => u.id === userId)) return prev
          return [...prev, { id: userId, name: userName }]
        })

        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.id !== userId))
        }, 3000)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const broadcastTyping = () => {
    if (!user || !profile || !channelRef.current) return

    if (timeoutRef.current) clearTimeout(timeoutRef.current)

    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id, userName: profile.full_name },
    })

    timeoutRef.current = setTimeout(() => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'stop_typing',
        payload: { userId: user.id },
      })
    }, 2000)
  }

  return { typingUsers, broadcastTyping }
}
