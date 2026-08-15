import type { Message, MessageCategory, Profile } from '@shared/types'

export interface ChatMessage extends Message {
  sender: Pick<Profile, 'full_name' | 'avatar_url'> | null
  file_url?: string | null
  file_name?: string | null
  file_type?: string | null
  // metadata se hereda de Message (migracion 031): ya no vive solo en memoria.
  is_ai?: boolean
  /**
   * De quien es la conversacion.
   *
   * Las respuestas de Lumix se guardan con el sender_id de quien pregunto, pero al cargarlas
   * se reemplaza por 'ai' para pintarlas como suyas. Eso borraba al dueño, y el admin -que
   * lee todo el chat del equipo- terminaba recibiendo los popouts de otra persona.
   */
  owner_id?: string
}

export interface SendMessagePayload {
  content: string
  category: MessageCategory | null
  file_url?: string
  file_name?: string
  file_type?: string
  reply_to?: ReplyTarget | null
}

/**
 * Mensaje al que se esta respondiendo.
 *
 * El texto y el autor se guardan como copia en la metadata en vez de leerse del original:
 * el chat carga los ultimos 50 mensajes, asi que el original puede quedar fuera de esa
 * ventana y la cita se veria vacia. Con la copia siempre se puede pintar; reply_to sigue
 * apuntando a la fila real para poder saltar a ella cuando si esta cargada.
 */
export interface ReplyTarget {
  id: string
  author: string
  text: string
  /** Actividad de la que habla el mensaje citado, si se sabe cual es. */
  activityId?: string
}
