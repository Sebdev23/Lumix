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
}
