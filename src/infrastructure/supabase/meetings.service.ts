import { supabase } from '@infrastructure/supabase/client'
import type { Meeting } from '@shared/types'

export const meetingsService = {
  async getByTeam(teamId: string): Promise<Meeting[]> {
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('team_id', teamId)
      .order('scheduled_at', { ascending: true })
    if (error) throw error
    return data ?? []
  },

  async getUpcoming(teamId: string): Promise<Meeting[]> {
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('team_id', teamId)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at')
      .limit(10)
    if (error) throw error
    return data ?? []
  },

  async getById(id: string): Promise<Meeting | null> {
    const { data, error } = await supabase.from('meetings').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async create(
    meeting: Omit<
      Meeting,
      'id' | 'audio_url' | 'transcript' | 'minutes' | 'created_at' | 'updated_at'
    >,
  ): Promise<Meeting> {
    const { data, error } = await supabase.from('meetings').insert(meeting).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, updates: Partial<Meeting>): Promise<Meeting> {
    const { data, error } = await supabase
      .from('meetings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  async saveAudio(id: string, audioUrl: string): Promise<void> {
    const { error } = await supabase
      .from('meetings')
      .update({ audio_url: audioUrl, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async saveTranscript(id: string, transcript: string): Promise<void> {
    const { error } = await supabase
      .from('meetings')
      .update({ transcript, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async saveMinutes(id: string, minutes: string): Promise<void> {
    const { error } = await supabase
      .from('meetings')
      .update({ minutes, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },
}
