import { supabase } from '@infrastructure/supabase/client'

// Registro de lo que la IA decidio y de como lo corrigio el usuario.
//
// REGLA DE ORO DE ESTE ARCHIVO: nunca lanza. Es telemetria, no parte del flujo.
// Si la tabla no existe, si falla la red o si RLS rechaza, el chat sigue igual.
// Por eso todo devuelve null/void y los errores solo se loguean.

export interface LogDecisionInput {
  teamId: string
  userId: string
  messageId?: string | null
  sourceText: string
  model?: string | null
  predictedCategory: string
  predictedDepth?: string | null
  confidence?: number | null
  predictedEntities?: unknown
}

export interface CorrectionInput {
  finalCategory?: string | null
  finalDepth?: string | null
  source: 'popout' | 'edicion_manual'
}

export const aiDecisionsService = {
  // Devuelve el id de la fila para poder marcarle una correccion despues.
  async log(input: LogDecisionInput): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('ai_decisions')
        .insert({
          team_id: input.teamId,
          user_id: input.userId,
          message_id: input.messageId ?? null,
          source_text: input.sourceText,
          model: input.model ?? null,
          predicted_category: input.predictedCategory,
          predicted_depth: input.predictedDepth ?? null,
          confidence: input.confidence ?? null,
          predicted_entities: input.predictedEntities ?? null,
        })
        .select('id')
        .single()

      if (error) {
        console.warn('ai_decisions log failed (ignorado):', error.message)
        return null
      }
      return data?.id ?? null
    } catch (err) {
      console.warn('ai_decisions log failed (ignorado):', err)
      return null
    }
  },

  async markCorrection(id: string | null, correction: CorrectionInput): Promise<void> {
    if (!id) return
    try {
      const { error } = await supabase
        .from('ai_decisions')
        .update({
          final_category: correction.finalCategory ?? null,
          final_depth: correction.finalDepth ?? null,
          corrected: true,
          correction_source: correction.source,
          corrected_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) console.warn('ai_decisions correction failed (ignorado):', error.message)
    } catch (err) {
      console.warn('ai_decisions correction failed (ignorado):', err)
    }
  },

  /**
   * Marca como corregida la decision que produjo esta fila, sin conocer su id.
   *
   * La correccion por popout casi nunca ocurre (solo aparece cuando la categoria es
   * ambigua). Lo que la gente hace de verdad es dejar que Lumix cree la actividad y
   * despues arreglarla. Esa es la senal util, y hasta ahora se perdia entera.
   *
   * La ventana de tiempo importa: editar el titulo diez minutos despues de crearla dice
   * "la IA se equivoco"; editarlo la semana siguiente dice "cambio el trabajo". Solo lo
   * primero es una correccion.
   */
  async markCorrectionByEntity(
    table: 'activities' | 'errors',
    entityId: string,
    correction: CorrectionInput,
    withinMinutes = 30,
  ): Promise<void> {
    try {
      const desde = new Date(Date.now() - withinMinutes * 60_000).toISOString()
      const { data, error } = await supabase
        .from('ai_decisions')
        .select('id')
        .eq('entity_table', table)
        .eq('entity_id', entityId)
        .eq('corrected', false)
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) {
        console.warn('ai_decisions lookup failed (ignorado):', error.message)
        return
      }
      if (data?.[0]?.id) await this.markCorrection(data[0].id, correction)
    } catch (err) {
      console.warn('ai_decisions correction failed (ignorado):', err)
    }
  },

  // A que fila (activities/errors) termino apuntando la decision.
  async linkEntity(id: string | null, table: 'activities' | 'errors', entityId: string) {
    if (!id) return
    try {
      await supabase
        .from('ai_decisions')
        .update({ entity_table: table, entity_id: entityId })
        .eq('id', id)
    } catch {
      // silencio intencional
    }
  },

  /**
   * Filas crudas para armar la tasa de correccion por categoria/modelo.
   *
   * "corrected" no captura TODO error de clasificacion (solo lo que el usuario corrigio por
   * popout o editando en los 30 minutos siguientes, ver markCorrectionByEntity), pero es la
   * unica señal real que hay: mejor una aproximacion medida que ninguna.
   */
  async getRecentDecisions(
    teamId: string,
    sinceDays = 30,
  ): Promise<{ predicted_category: string | null; model: string | null; corrected: boolean }[]> {
    try {
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('ai_decisions')
        .select('predicted_category, model, corrected')
        .eq('team_id', teamId)
        .gte('created_at', since)
        .not('predicted_category', 'is', null)
      if (error) {
        console.warn('ai_decisions fetch failed (ignorado):', error.message)
        return []
      }
      return data ?? []
    } catch (err) {
      console.warn('ai_decisions fetch failed (ignorado):', err)
      return []
    }
  },
}
