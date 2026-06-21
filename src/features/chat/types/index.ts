import type { Message, MessageCategory, Profile } from '@shared/types'

export interface ChatMessage extends Message {
  sender: Pick<Profile, 'full_name' | 'avatar_url'> | null
  file_url?: string | null
  file_name?: string | null
  file_type?: string | null
  metadata?: Record<string, unknown>
  is_ai?: boolean
}

export interface SendMessagePayload {
  content: string
  category: MessageCategory | null
  file_url?: string
  file_name?: string
  file_type?: string
}
