import { supabase } from '@infrastructure/supabase/client'
import type { Activity } from '@shared/types'

export const activitiesService = {
  async getByTeam(teamId: string): Promise<Activity[]> {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  // Todas las actividades donde el usuario es responsable, en CUALQUIER equipo (personales).
  async getByResponsibleAll(userId: string): Promise<Activity[]> {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('responsible_id', userId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  // Todas las actividades de un conjunto de equipos (los que el usuario lidera).
  async getByTeams(teamIds: string[]): Promise<Activity[]> {
    if (teamIds.length === 0) return []
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .in('team_id', teamIds)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async getByParent(parentId: string): Promise<Activity[]> {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('parent_activity_id', parentId)
    if (error) throw error
    return data ?? []
  },

  async getById(id: string): Promise<Activity | null> {
    const { data, error } = await supabase.from('activities').select('*').eq('id', id).single()
    if (error) throw error
    return data
  },

  async getByResponsible(teamId: string, userId: string): Promise<Activity[]> {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('team_id', teamId)
      .eq('responsible_id', userId)
      .order('due_date')
    if (error) throw error
    return data ?? []
  },

  async create(
    activity: Omit<
      Activity,
      'id' | 'created_at' | 'days_remaining' | 'updated_at' | 'completed_at'
    >,
  ): Promise<Activity> {
    const { data, error } = await supabase.from('activities').insert(activity).select().single()
    if (error) throw error
    return data
  },

  async update(id: string, updates: Partial<Activity>): Promise<Activity> {
    const { data, error } = await supabase
      .from('activities')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  /**
   * Elimina una actividad (migracion 038). La RLS decide quien puede: admin, jefatura del
   * equipo, o quien tenga el permiso 'actividades.eliminar' concedido ahi. Un trigger limpia
   * el vinculo con la minuta y las notificaciones.
   */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('activities').delete().eq('id', id)
    if (error) throw error
  },

  /**
   * Deshace una actividad recien creada (migracion 037).
   *
   * No es un borrado general: la base exige que sea tuya, de hace menos de 30 minutos, que
   * siga pendiente y que no tenga delegadas. Devuelve 'ok' o el motivo del rechazo, para
   * poder explicarlo en vez de decir "no se pudo".
   */
  async deshacer(id: string): Promise<string> {
    const { data, error } = await supabase.rpc('deshacer_actividad', { p_id: id })
    if (error) throw error
    return data as string
  },

  async subscribeToTeam(
    teamId: string,
    callback: (payload: { new: Activity; old: Activity }) => void,
  ) {
    return supabase
      .channel(`activities-${teamId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activities',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          callback(payload as unknown as { new: Activity; old: Activity })
        },
      )
      .subscribe()
  },
}
