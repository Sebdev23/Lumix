import { useState, useEffect, useRef } from 'react'
import { supabase } from '@infrastructure/supabase/client'
import { messagesService } from '@infrastructure/supabase/messages.service'
import {
  classifyMessage,
  classifyBulk,
  resolveUpdate,
  askQuestion,
  type ClassifyResult,
  type BulkActivity,
  type HistoryTurn,
} from '@core/ai-engine/client'
import { activitiesService } from '@infrastructure/supabase/activities.service'
import { statusLabels } from '@features/activities/hooks/useActivities'
import { errorsService } from '@infrastructure/supabase/errors.service'
import { profilesService } from '@infrastructure/supabase/profiles.service'
import { teamsService } from '@infrastructure/supabase/teams.service'
import { notificationsService } from '@infrastructure/supabase/notifications.service'
import { minutesService } from '@infrastructure/supabase/minutes.service'
import { aiDecisionsService } from '@infrastructure/supabase/ai-decisions.service'
import { deriveEstado, compromisosEnVentana, compromisoStats } from '@shared/utils/compromisos'
import { useAuth } from '@core/auth/hooks/useAuth'
import { useCapabilities } from '@core/auth/hooks/useCapabilities'
import { formatDateLocal } from '@shared/utils/date'
import type { ChatMessage, SendMessagePayload } from '@features/chat/types'
import type { Activity, ActivityStatus, HojaTipo } from '@shared/types'

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  bloqueado: 'Bloqueado',
  falta_informacion: 'Falta info',
  esperando_aprobacion: 'Esperando aprobacion',
  completado: 'Completado',
}

// Verbos que sugieren que el mensaje MODIFICA una actividad existente (gate barato
// antes de llamar a la IA de actualizacion). La IA decide en definitiva (isUpdate).
// Los mensajes recien agregados llevan un id temporal (`opt-...`, `ai-warn-...`) hasta que
// la base devuelve el suyo. Solo los ids reales sirven para una FK.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isSavedId = (id?: string | null): boolean => !!id && UUID_RE.test(id)

// Acuses de recibo: no piden nada y no hay que responderles con datos del equipo.
// Acepta combinaciones ("ok gracias", "dale, perfecto"), que es como se escribe de verdad.
const ACUSE_RE =
  /^(?:(?:ok|oka?y|dale|listo|gracias|muchas|perfecto|bien|buenisimo|genial|ya|bueno|de acuerdo|entendido|👍|✅)[\s,.!]*)+$/i

// "Deshaz eso". Se exige que sea una frase corta y dedicada: "deshaz" dentro de una oracion
// larga casi siempre es otra cosa ("hay que deshacer el nudo del proceso").
// OJO: "eliminala"/"cancelalo" tambien existen ACENTUADOS ("elimínala", "cancélalo") -es la
// forma correcta en espanol al pegarle el pronombre "la"/"lo" al imperativo-, y esa es
// justo la forma que alguien escribe si no tipea rapido. Sin esta rama quedaba sin
// reconocerse el pedido mas comun de todos.
const DESHACER_RE =
  /^(deshaz|deshacer|deshacelo|deshazlo|b[oó]rra(la|lo)|elimina(la|lo)?|elim[ií]n(ala|alo)|cancela(la|lo)?|cancél(ala|alo)|no era (eso|esa|ese)|me equivoqu[eé]|equivocado|mal)(\s+(eso|esa|ese|esto|la|lo))?[\s.!]*$/i

// "Ayuda": el tip de Perfil ("Escribi ayuda en el chat...") prometia esto pero nunca se habia
// implementado -el mensaje caia en la clasificacion normal de la IA y creaba una actividad
// rara titulada "ayuda" (bug real reportado). Exige que sea la frase completa y corta -"ayuda"
// dentro de una oracion larga es otra cosa ("necesito ayuda con el pedido de mañana").
const AYUDA_RE = /^(ayuda|help|que puedes hacer|qué puedes hacer)[\s?.!]*$/i

const MENSAJE_AYUDA = `Esto es lo que podes escribirme, en lenguaje natural:

📋 Actividades — "Revisar el pedido de mañana, para Juan"
🗓️ Minuta — "Agrega a la minuta: revisar capacidad de planta"
🚀 Proyectos — "Crea un proyecto Gobernar el Infull, primer punto revisar quien carga el pedido"
🐛 Errores — "Se cayó el reporte de ventas, es urgente"
📦 Modo masivo — pega una lista de varias actividades de una vez
✏️ Cambios — respondiendo un mensaje: "cambiale la fecha al viernes", "reasignala a Pedro", "márcala completa"
🗑️ Deshacer — "bórrala" (respondiendo) o "deshacer" (lo último que creaste)
💬 Consultas — "¿cuántas actividades tiene Juan pendientes?"

Tocá el selector de arriba (Auto/Actividad/Error/...) si querés forzar un tipo en vez de dejar que la IA lo adivine.`

// Cuando un mensaje habla de "lo ultimo" sin nombrarlo.
//
// El primer intento fue detectar pronombres con una expresion regular y fallo en los dos
// sentidos: no pillaba encliticos tras consonante ("ponle") ni frases sin pronombre ("ya
// esta lista"). La señal buena es otra y es mas simple: es CORTO, pide un cambio, y no
// nombra ninguna actividad. Si nombra alguna, se va al flujo normal.
const LARGO_MAXIMO_ANAFORA = 70

// Cuanto se espera antes de avisar de la carga acumulada. Ver registrarSobrecarga.
const ESPERA_RESUMEN_SOBRECARGA = 25_000

const UPDATE_VERBS =
  /(\blist[oa]s?\b|complet|termin|finaliz|\bhech[oa]\b|mu[eé]ve|p[aá]sa|reprogram|posterg|adelant|reasign|as[ií]gna|bloque|desbloque|en proceso|falta info|esperando aprob|prioridad|c[aá]mbi|pon[lg]|deja(la|lo)|atrasa)/i

// "Agrega/crea/arma un proyecto...", en Auto: sin esto, Minuta ya distinguia 'proyecto' de
// 'minuta' por tipo, pero solo si alguien tocaba el selector del chat -en Auto, "agrega un
// proyecto..." caia a la clasificacion generica y se creaba como una actividad suelta, caso
// real reportado-.
const PROYECTO_RE =
  /\b(crea|creemos|arma|armemos|agrega|agreguemos|inicia|iniciemos|abre|abramos)\w*\s+(un\s+)?proyecto\b/i

// Marca donde termina el NOMBRE del proyecto y empieza su primer punto/subtarea, cuando
// alguien dicta los dos en el mismo mensaje (caso real: "agrega un proyecto, gobernar el
// infull, primer punto, revisar quien cargara el pedido..."). El clasificador de IA esta
// pensado para titulo de ACTIVIDAD ("Agregar proyecto y revisar carga de pedido"), no para
// el nombre limpio de un proyecto -por eso este parseo es aparte, no via classifyMessage-.
const PRIMER_PUNTO_RE = /^(primer punto|primera tarea|primero|paso 1)\b[:\s]*/i

function parseProyectoIntent(content: string): { nombre: string; primerPunto: string | null } {
  const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  // El reemplazo no hace nada si la frase disparadora no esta presente (ej. cuando se elige
  // "Proyecto" a mano en el selector y no hace falta decir "agrega un proyecto"). El conector
  // que suele quedar pegado ("...proyecto PARA revisar X") tampoco es parte del nombre.
  const texto = content
    .replace(PROYECTO_RE, '')
    .replace(/^[,:\s]+/, '')
    .replace(/^(para|de|sobre|con)\s+/i, '')
  const partes = texto
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  const idx = partes.findIndex((p) => PRIMER_PUNTO_RE.test(p))
  if (idx === -1) {
    return { nombre: capitalizar(partes.join(', ') || 'Nuevo proyecto'), primerPunto: null }
  }
  const nombre = partes.slice(0, idx).join(', ') || 'Nuevo proyecto'
  const restoPunto = partes[idx].replace(PRIMER_PUNTO_RE, '')
  const primerPunto = [restoPunto, ...partes.slice(idx + 1)].filter(Boolean).join(', ')
  return { nombre: capitalizar(nombre), primerPunto: primerPunto || null }
}

// Responder a una actividad ya creada diciendo que en realidad es un proyecto: convierte esa
// actividad (se elimina) y crea el proyecto en su lugar, en vez de caer en el flujo de
// "actualizar campos" (que no tiene forma de decir "cambia de tipo" y contesta "no vi ningun
// cambio", caso real reportado).
const RECLASIFICAR_PROYECTO_RE =
  /\b(es\s+(un\s+|una\s+)?proyecto\b|(pasalo|p[aá]salo|conviertelo|convi[eé]rtelo|hazlo|creala|cr[eé]ala|crealo|cr[eé]alo)\s+(a\s+|como\s+)?proyecto)\b/i

// Mismo caso que el de proyecto (arriba), pero para ingesta: "es una ingesta" respondiendo a
// una actividad ya creada (caso real reportado: la actividad quedaba intacta y la IA contestaba
// "no vi ningun cambio", porque el tipo no es uno de los campos que sabe actualizar).
const RECLASIFICAR_INGESTA_RE =
  /\b(es\s+(un\s+|una\s+)?ingesta\b|(pasalo|p[aá]salo|conviertelo|convi[eé]rtelo|hazlo|creala|cr[eé]ala|crealo|cr[eé]alo)\s+(a\s+|como\s+)?ingesta)\b/i

// Mismo caso, ahora para error (a pedido de Sebastian, misma logica que proyecto/ingesta).
const RECLASIFICAR_ERROR_RE =
  /\b(es\s+(un\s+)?error\b|(pasalo|p[aá]salo|conviertelo|convi[eé]rtelo|hazlo|creala|cr[eé]ala|crealo|cr[eé]alo)\s+(a\s+|como\s+)?error)\b/i

// Detecta un documento de minuta ya estructurado (secciones + viñetas), pegado entero en modo
// Minuta/Proyecto -caso real reportado por Sebastian: alguien pega el acta completa de una
// reunion grabada y Lumix la mete entera como UN solo tema, perdiendo toda la estructura.
// Contar viñetas (no encabezados: varian mucho -numeros, emojis, mayusculas-, las viñetas son
// la señal universal sin importar el formato de quien escribe el acta) alcanza para decidir si
// vale la pena separar en varios temas en vez de uno solo.
function contarVinetas(texto: string): number {
  return texto.split('\n').filter((l) => /^[ \t]*[*\-•][ \t]+\S/.test(l)).length
}
const MINUTA_ESTRUCTURADA_MIN_VINETAS = 4

// Primer filtro para el popout: si el texto MENCIONA la palabra "error" o "ingesta",
// en modo Auto siempre preguntamos que tipo es (actividad / error / ingesta). Solo se salta
// si el usuario ya eligio el tipo con el selector del chat (ahi es explicito y no hay duda).
const MENTIONS_ERROR = /\berror(es)?\b/i
const MENTIONS_INGESTA = /\bingest(a|ar|as|ando|amos)\b/i
// Señal SUAVE de que el mensaje describe algo de varios pasos, sin usar la frase explicita
// "crea/agrega un proyecto" (esa ya se resuelve sola, mas arriba, sin preguntar). Aca la duda
// es real: ¿esto es una actividad o el usuario esta describiendo una iniciativa con partes?
const MENTIONS_PROYECTO_SUAVE =
  /\b(primer punto|primera tarea|paso 1|varios pasos|varias (tareas|subtareas|etapas)|subtareas)\b/i

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      added++
    }
  }
  return result
}

const DEFAULT_DUE_DAYS = 6

function defaultDueDate(): string {
  return addBusinessDays(new Date(), DEFAULT_DUE_DAYS).toISOString()
}

// "YYYY-MM-DD" se parsea como UTC y en Chile (UTC-4) retrocede al dia anterior.
// Anclamos a mediodia local para que getDay() y los calculos de dias sean correctos.
function toLocalDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
}

// Normaliza para comparar nombres sin tildes ni mayusculas
function normalizeName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

type Member = { id: string; full_name: string; avatar_url: string | null }

// Devuelve los miembros que mejor calzan con el nombre buscado.
// - 1 resultado => asignacion directa
// - 0 o >1 => se pide confirmacion en el chat
function matchMembers(searchName: string, members: Member[]): Member[] {
  const q = normalizeName(searchName)
  if (!q) return []

  const exact = members.filter((m) => normalizeName(m.full_name) === q)
  if (exact.length) return exact

  const qTokens = q.split(/\s+/).filter(Boolean)
  const scored = members
    .map((m) => {
      const nameTokens = normalizeName(m.full_name).split(/\s+/).filter(Boolean)
      const fullName = normalizeName(m.full_name)
      let score = 0
      for (const qt of qTokens) {
        if (nameTokens.some((nt) => nt === qt)) score += 3
        else if (nameTokens.some((nt) => nt.startsWith(qt) || qt.startsWith(nt))) score += 2
        else if (fullName.includes(qt)) score += 1
      }
      return { m, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  if (!scored.length) return []
  const topScore = scored[0].score
  return scored.filter((x) => x.score === topScore).map((x) => x.m)
}

// Candidatos por coincidencia de titulo, para cuando la IA no logra identificar
// una sola actividad y hay que preguntar en el chat.
function pickActivityCandidates(text: string, activities: Activity[]): Activity[] {
  const q = normalizeName(text)
  const qTokens = q.split(/\s+/).filter((t) => t.length > 2)
  const scored = activities
    .map((a) => {
      const t = normalizeName(a.title)
      let score = 0
      for (const qt of qTokens) if (t.includes(qt)) score++
      return { a, score }
    })
    .sort((x, y) => y.score - x.score)
  const withScore = scored.filter((x) => x.score > 0)
  return (withScore.length ? withScore : scored).slice(0, 6).map((x) => x.a)
}

/**
 * Actividades que el texto nombra de verdad.
 *
 * Distinto de pickActivityCandidates, que siempre devuelve algo -sirve para ofrecer opciones
 * cuando hay que preguntar-. Aca hace falta lo contrario: saber si el mensaje NO nombra
 * ninguna, que es la señal de que habla de la ultima. Por eso solo cuentan las palabras
 * largas: "la" o "para" aparecen en todos los titulos y no nombran nada.
 */
function actividadesMencionadas(text: string, activities: Activity[]): Activity[] {
  const tokens = normalizeName(text)
    .split(/\s+/)
    .filter((t) => t.length > 3)
  if (!tokens.length) return []
  return activities.filter((a) => {
    const titulo = normalizeName(a.title)
    return tokens.some((t) => titulo.includes(t))
  })
}

const NAME_STOPWORDS = new Set([
  'que',
  'cual',
  'cuales',
  'actividad',
  'actividades',
  'tarea',
  'tareas',
  'pendiente',
  'pendientes',
  'tiene',
  'tengo',
  'tienes',
  'esta',
  'semana',
  'para',
  'del',
  'los',
  'las',
  'mis',
  'son',
  'hay',
  'proxima',
  'proximo',
  'proximamente',
  'hoy',
  'manana',
  'muestra',
  'muestrame',
  'dame',
  'lista',
  'listar',
  'ver',
  'mias',
  'tengan',
  'tienen',
  'esas',
  'este',
  'mes',
  'dia',
  'fecha',
  'prioridad',
  'estado',
])

// Detecta si la pregunta menciona a uno (o varios) miembros del equipo.
function findMentionedMembers(question: string, members: Member[]): Member[] {
  const qTokens = normalizeName(question)
    .split(/\s+/)
    .filter((t) => t.length > 2 && !NAME_STOPWORDS.has(t))
  if (!qTokens.length) return []

  const fullNames = members.map((m) => normalizeName(m.full_name))

  const scored = members
    .map((m, i) => {
      const nameTokens = normalizeName(m.full_name).split(/\s+/).filter(Boolean)
      const fullName = fullNames[i]
      let score = 0
      for (const qt of qTokens) {
        if (nameTokens.some((nt) => nt === qt)) score += 3
        else if (nameTokens.some((nt) => nt.startsWith(qt) || qt.startsWith(nt))) score += 2
        else if (fullName.includes(qt)) score += 1
      }
      return { m, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  if (!scored.length) return []
  const top = scored[0].score
  return scored.filter((x) => x.score === top).map((x) => x.m)
}

function weekRange(offsetWeeks = 0): { from: Date; to: Date } {
  const d = new Date()
  const diffToMon = (d.getDay() + 6) % 7
  const mon = new Date(d)
  mon.setDate(d.getDate() - diffToMon + offsetWeeks * 7)
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  sun.setHours(23, 59, 59, 999)
  return { from: mon, to: sun }
}

function dayRange(offsetDays = 0): { from: Date; to: Date } {
  const from = new Date()
  from.setDate(from.getDate() + offsetDays)
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setHours(23, 59, 59, 999)
  return { from, to }
}

// Interpreta el marco temporal mencionado en la pregunta.
function parseTimeframe(question: string): { from: Date; to: Date } | null {
  const n = normalizeName(question)
  if (/proxima semana|semana que viene|siguiente semana/.test(n)) return weekRange(1)
  if (/esta semana|semana actual/.test(n)) return weekRange(0)
  if (/\bhoy\b/.test(n)) return dayRange(0)
  if (/\bmanana\b/.test(n)) return dayRange(1)
  return null
}

function dueWithin(dueDate: string, range: { from: Date; to: Date }): boolean {
  const d = new Date(dueDate.split('T')[0] + 'T12:00:00')
  return d >= range.from && d <= range.to
}

// Mostrar tabla editable (no crear) cuando el usuario quiere gestionar varias:
//   - "cambiar/ver/modificar LAS de <persona/equipo>"  (plural + referencia)
//   - un verbo de gestion AL INICIO + palabra generica "actividades/tareas"
//     ("reasignar actividades", "modificar tareas", "quiero cambiar actividades")
// Se usan raices (stems) para tolerar typos: "modifcar", "activades", "reasignar".
function wantsEditList(content: string): boolean {
  const n = normalizeName(content)
  const editVerb = /(cambi|modif|edit|gestion|actualiz|reasign|most|muestr|\bver\b|revis)/.test(n)
  const pluralRef = /\b(las|los|todas|todos)\s+(de[l]?\b|que\b|tarea|activ|pendient|labor)/.test(n)
  const startsEdit =
    /^(reasign|cambi|modif|edit|gestion|actualiz|ver\b|mostr|muestr|revis|quiero\s+(cambi|modif|edit|ver|reasign|gestion))/.test(
      n,
    )
  const genericActs = /\b(activ|tarea|pendient)\w*/.test(n)
  // "quiero modificar algunas/varias" no nombra "actividades", pero el intento es el mismo:
  // gestionar mas de una. Caso real: sin esto caia a "consulta" y Lumix solo daba ejemplos de
  // como escribir el cambio ("cambia la fecha de X..."), en vez de mostrar la lista para elegir.
  const vagoPlural = /\b(algun\w*|vari[oa]s|un[oa]s)\b/.test(n)
  return (editVerb && pluralRef) || (startsEdit && (genericActs || vagoPlural))
}

// Preguntas tipo "que actividades tiene X" / "que tengo esta semana" => tabla editable.
function wantsQuestionList(content: string): boolean {
  const n = normalizeName(content)
  const hasActWord = /(activ|tarea|pendient|labor)/.test(n)
  const listVerbs =
    /(que tiene|que tengo|tengo|tiene|mis|most|muestr|dame|lista|listar|\bver\b|cuales|proxim|esta semana|hoy|manana|pendient|semana|equipo)/.test(
      n,
    )
  return hasActWord && listVerbs
}

export interface PendingActivity {
  title: string
  description: string
  priority: number
  dueDate: string
  category: 'actividad' | 'ingesta'
  senderId: string
  // Se arrastran por el desvio (preguntar responsable, sobrecarga) para no perder ni el
  // vinculo con el mensaje que origino la actividad (migracion 032) ni el de telemetria.
  sourceMessageId?: string
  decisionId?: string | null
}

// Tema de minuta creado desde el chat, a la espera de que se resuelva el responsable.
export interface PendingMinuta {
  tema: string
  comentarios: string
  plazo: string | null
}

// Actividad frenada por sobrecarga: espera a que el usuario decida la fecha.
export interface PendingOverload {
  title: string
  description: string
  priority: number
  dueDate: string
  category: 'actividad' | 'ingesta'
  responsibleId: string
  responsibleName: string
  senderId: string
  sameDayCount: number
  sourceMessageId?: string
  decisionId?: string | null
}

/**
 * Varias actividades creadas para un dia que ya venia cargado, agrupadas en un solo aviso.
 *
 * Reemplaza a PendingOverload, que avisaba de a una y ANTES de crear. Cinco mensajes seguidos
 * producian cinco interrupciones, y si no se contestaba, el trabajo no se registraba.
 */
export interface PendingLoteSobrecarga {
  responsibleId: string
  responsibleName: string
  dia: string
  yaTenia: number
  items: { id: string; title: string }[]
}

export interface PendingUpdate {
  changes: {
    status: string | null
    due_date: string | null
    responsible: string | null
    priority: number | null
    description: string | null
    title: string | null
  }
  action: string
  reply: string
}

export interface PendingCategory {
  content: string
  title: string
  priority: number
  dueDate: string
  severity: string | null
  responsibleHint: string | null
  senderId: string
  // Opciones no-actividad a ofrecer en el popout, segun las palabras encontradas en el texto.
  options: ('error' | 'ingesta' | 'proyecto')[]
  sourceMessageId: string
  // Para registrar si el usuario termina corrigiendo lo que predijo la IA.
  decisionId?: string | null
  predictedCategory?: string
}

export interface QuickChanges {
  status?: ActivityStatus
  due_date?: string
  responsibleId?: string
  responsibleName?: string
  priority?: number
}

export function useChatMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // Espejo de messages para leerlo desde los flujos async sin arrastrar un closure viejo:
  // classifyAndAct corre despues de varios await y ahi el estado ya cambio.
  const messagesRef = useRef<ChatMessage[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [aiProcessing, setAiProcessing] = useState(false)
  const { user, profile } = useAuth()
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const membersRef = useRef<Member[]>([])
  // Umbral de sobrecarga del equipo (migracion 036). Se lee una vez: cambia muy de vez en
  // cuando y consultarlo en cada creacion agregaria un viaje a algo que ya hace varios.
  const umbralRef = useRef<number>(2)
  // Nombre del equipo activo, para avisar en confirmaciones (ej. minuta) donde quedo cada cosa.
  const teamNameRef = useRef<string>('')
  // EL HILO. La ultima actividad de la que se hablo en esta sesion -creada o modificada-.
  // Es el sujeto implicito de "muevela al viernes" o "pasasela a Manuel".
  const ultimaActividadRef = useRef<{ id: string; title: string } | null>(null)
  // Lo ultimo deshacible. Solo se guarda lo que Lumix hizo en ESTA sesion: "deshaz eso" no
  // puede alcanzar algo de ayer ni de otra persona.
  const ultimaCreacionRef = useRef<{ id: string; title: string } | null>(null)
  // Actividades creadas hoy sobre un dia que ya venia cargado, esperando avisarse juntas.
  const sobrecargaBufferRef = useRef<
    {
      activityId: string
      title: string
      dueDate: string
      responsibleId: string
      responsibleName: string
      yaTenia: number
    }[]
  >([])
  const sobrecargaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // La funcion se declara mas abajo (necesita helpers definidos despues); el ref permite
  // llamarla desde el cleanup del primer efecto sin depender del orden de declaracion.
  const emitirResumenSobrecargaRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const teamId = profile?.team_id ?? ''
  // Capacidades segun el rol del EQUIPO ACTIVO (una persona puede ser jefatura en un equipo
  // y colaboradora en otro). isAdmin = admin global (ve toda la conversacion del equipo).
  const {
    isColaborador,
    isGlobalAdmin: isAdmin,
    canAssignOthers,
    canAssignMinuta,
  } = useCapabilities()

  useEffect(() => {
    if (!user || !teamId) return

    let cancelled = false

    async function load() {
      const [data, members, equipo] = await Promise.all([
        messagesService.getByTeam(teamId, 50),
        profilesService.getByTeam(teamId),
        teamsService.getById(teamId),
      ])
      if (cancelled) return
      umbralRef.current = equipo?.umbral_sobrecarga ?? 2
      teamNameRef.current = equipo?.name ?? ''
      membersRef.current = members
      // Cada usuario ve SOLO su propia conversacion (sus mensajes + las respuestas de
      // Lumix a el, que se guardan con su sender_id). El admin ve todo.
      const personal = !isAdmin ? data.filter((m) => m.sender_id === user?.id) : data
      setMessages(
        personal.map((msg) => {
          const isAi = msg.sender_id === 'ai' || (msg as ChatMessage).is_ai
          if (isAi) {
            return {
              ...msg,
              sender: { full_name: 'Lumix', avatar_url: null },
              owner_id: msg.sender_id, // antes de perderlo al marcarlo como 'ai'
              sender_id: 'ai',
            }
          }
          const member = members.find((m) => m.id === msg.sender_id)
          // El admin no esta en la lista de miembros: resolvemos su propio nombre con su perfil.
          const ownFallback =
            msg.sender_id === user?.id
              ? { full_name: profile?.full_name ?? 'Yo', avatar_url: profile?.avatar_url ?? null }
              : null
          return {
            ...msg,
            sender: member
              ? { full_name: member.full_name, avatar_url: member.avatar_url ?? null }
              : ownFallback,
          }
        }),
      )
      setLoading(false)
    }

    load()

    return () => {
      cancelled = true
      // Si quedaba un aviso de carga esperando, se emite ahora: si no, se perderia al
      // cambiar de pagina y nadie se enteraria de la acumulacion.
      if (sobrecargaTimerRef.current) {
        clearTimeout(sobrecargaTimerRef.current)
        void emitirResumenSobrecargaRef.current()
      }
    }
  }, [user, teamId])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`chat-${teamId}-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage
          // Solo admin ve mensajes de otros. Las respuestas de Lumix llevan el sender_id
          // del usuario que las genero, asi que este filtro tambien las mantiene privadas.
          if (!isAdmin && newMsg.sender_id !== user?.id) return
          const isAiMsg = newMsg.sender_id === 'ai' || newMsg.is_ai
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            const member = membersRef.current.find((m) => m.id === newMsg.sender_id)
            return [
              ...prev,
              {
                ...newMsg,
                owner_id: newMsg.sender_id,
                sender: isAiMsg
                  ? { full_name: 'Lumix', avatar_url: null }
                  : member
                    ? { full_name: member.full_name, avatar_url: member.avatar_url }
                    : newMsg.sender_id === user?.id
                      ? {
                          full_name: profile?.full_name ?? 'Yo',
                          avatar_url: profile?.avatar_url ?? null,
                        }
                      : null,
              },
            ]
          })
        },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, profile?.team_id])

  async function ensureMembers(): Promise<Member[]> {
    if (membersRef.current.length === 0 && teamId) {
      try {
        membersRef.current = await profilesService.getByTeam(teamId)
      } catch (err) {
        console.error('Member fetch failed:', err)
      }
    }
    return membersRef.current
  }

  // Agrega el mensaje al hilo y lo guarda. La metadata viaja con el (migracion 031): las
  // alertas interactivas se guardaban con persist=false porque la tabla no tenia donde
  // ponerla, y el resultado era que la alerta de sobrecarga se veia en pantalla pero
  // desaparecia al recargar. Nunca se habia enviado.
  //
  // El id local es temporal (`ai-warn-...`); la fila lo recibe de la base. Se reemplaza con
  // el id real para que resolverla despues apunte a la fila correcta y para que al recargar
  // no aparezca duplicada.
  const appendAndSave = async (message: ChatMessage, persist = true) => {
    message = { ...message, owner_id: message.owner_id ?? user?.id }
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev
      return [...prev, message]
    })
    if (persist && message.sender_id === 'ai' && teamId && user) {
      try {
        const saved = await messagesService.send({
          content: message.content,
          sender_id: user.id,
          category: message.category,
          team_id: teamId,
          metadata: message.metadata ?? null,
          is_ai: true,
        })
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, id: saved.id } : m)))
      } catch (err) {
        console.error('Failed to save AI message:', err)
      }
    }
  }

  // Foto del equipo que se le pasa a la IA para responder preguntas: actividades visibles
  // segun el rol, errores abiertos y carga por persona. Un colaborador solo se ve a si mismo.
  async function buildTeamData(senderId: string) {
    const [activities, errors, members, temas] = await Promise.all([
      activitiesService.getByTeam(teamId),
      errorsService.getByTeam(teamId),
      profilesService.getByTeam(teamId),
      minutesService.getByTeam(teamId, 'minuta'),
    ])

    // Compromiso = nacio de un tema de minuta, o sea alguien lo tomo delante del equipo.
    // Lo demas es trabajo propio. Sin esta distincion, preguntar "que tiene pendiente el
    // equipo" en un equipo real devolvia 88 cosas cuando los compromisos eran 12: seis
    // veces mas ruido que señal, y la gente deja de creerle a la respuesta.
    const deMinuta = new Set(temas.flatMap((t) => t.linked_activity_ids))

    // Y lo que quedo a medio camino: tema con dueño escrito que nunca genero actividad.
    // Para el resto del sistema no existe -no suma carga, no aparece en Compromisos- asi
    // que si no se nombra aca, nadie se entera nunca.
    const aMedioCamino = temas
      .filter(
        (t) =>
          t.estado !== 'resuelto' &&
          t.linked_activity_ids.length === 0 &&
          (t.responsables.length > 0 || t.responsables_text !== ''),
      )
      .map((t) => ({
        tema: t.tema,
        responsables: t.responsables.length
          ? t.responsables
              .map((id) => members.find((m) => m.id === id)?.full_name ?? '?')
              .join(', ')
          : t.responsables_text,
        plazo: t.plazo,
      }))

    const visibleActivities = isColaborador
      ? activities.filter((a) => a.responsible_id === senderId)
      : activities

    membersRef.current = members

    const loadPct = (acts: Activity[]) =>
      Math.min(Math.round((acts.reduce((s, a) => s + (a.estimated_hours ?? 3), 0) / 42) * 100), 100)

    // Temas que TODAVIA se conversan en la reunion: sin actividad vinculada, o escalados
    // desde Compromisos ("definir en reunion"). Mismo criterio que la vista "Pendientes"
    // de la Minuta (useMinuta.ts): estado efectivo distinto de resuelto, y (sin vinculo
    // O estado crudo "definir"). Ver deriveEstado en shared/utils/compromisos.ts.
    const activitiesById = Object.fromEntries(activities.map((a) => [a.id, a]))
    const temasParaConversar = temas
      .filter((t) => {
        if (deriveEstado(t, activitiesById) === 'resuelto') return false
        return t.linked_activity_ids.length === 0 || t.estado === 'definir'
      })
      .map((t) => ({
        tema: t.tema,
        responsable: t.responsables.length
          ? t.responsables
              .map((id) => members.find((m) => m.id === id)?.full_name ?? '?')
              .join(', ')
          : t.responsables_text || null,
        plazo: t.plazo,
      }))

    // Cumplimiento semanal de compromisos (Level 10 Meeting de EOS, ver useCompromisos.ts):
    // solo lo que nacio de un tema de minuta y vence esta semana. Un colaborador solo ve lo
    // suyo, igual que el resto de teamData.
    const semanaActual = weekRange(0)
    const compromisosSemanaBase = compromisosEnVentana(
      activities,
      temas,
      semanaActual.from,
      semanaActual.to,
    ).filter((a) => !isColaborador || a.responsible_id === senderId)
    const compromisosSemana = compromisoStats(compromisosSemanaBase)

    return {
      today: new Date().toLocaleDateString('es-CL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
      activities: visibleActivities.map((a) => {
        const [y, m, d] = a.due_date.split('T')[0].split('-').map(Number)
        return {
          title: a.title,
          status: a.status,
          priority: a.priority,
          due_date: new Date(y, m - 1, d).toLocaleDateString('es-CL'),
          responsible: members.find((x) => x.id === a.responsible_id)?.full_name || 'Sin asignar',
          origen: deMinuta.has(a.id) ? 'compromiso' : 'propia',
        }
      }),
      sinAsignar: aMedioCamino,
      temasParaConversar,
      compromisosSemana,
      errors: errors
        .filter((e) => e.status !== 'cerrado')
        .map((e) => ({ title: e.title, severity: e.severity, status: e.status })),
      members: isColaborador
        ? [
            {
              name: profile?.full_name || 'Tu',
              activeTasks: visibleActivities.filter((a) => a.status !== 'completado').length,
              load: loadPct(visibleActivities.filter((a) => a.status !== 'completado')),
            },
          ]
        : members.map((m) => {
            const tasks = activities.filter(
              (a) => a.responsible_id === m.id && a.status !== 'completado',
            )
            return { name: m.full_name, activeTasks: tasks.length, load: loadPct(tasks) }
          }),
    }
  }

  /**
   * Deshace lo ultimo que Lumix creo en esta sesion.
   *
   * La base decide de verdad (funcion deshacer_actividad, migracion 037): tiene que ser tuya,
   * reciente, sin empezar y sin delegadas. Aca solo se traduce el motivo del rechazo a una
   * frase, porque "no se pudo" no le sirve a nadie.
   */
  async function deshacerUltima() {
    const ultima = ultimaCreacionRef.current
    if (!ultima) {
      await aiSay('No tengo nada reciente que deshacer.')
      return
    }

    let resultado: string
    try {
      resultado = await activitiesService.deshacer(ultima.id)
    } catch (err) {
      console.error('Deshacer fallo:', err)
      await aiSay('No pude deshacerlo. Intentalo de nuevo.')
      return
    }

    const motivos: Record<string, string> = {
      no_existe: `"${ultima.title}" ya no existe.`,
      no_es_tuya: `No puedo deshacer "${ultima.title}": la creo otra persona.`,
      muy_antigua: `"${ultima.title}" se creo hace mas de 30 minutos. Ciérrala o editala desde Actividades.`,
      ya_empezada: `"${ultima.title}" ya esta en curso, asi que no la borro. Si igual sobra, cambiala desde Actividades.`,
      tiene_delegadas: `"${ultima.title}" tiene actividades delegadas a otras personas. Borrarla las dejaria huerfanas.`,
    }

    if (resultado === 'ok') {
      ultimaCreacionRef.current = null
      if (ultimaActividadRef.current?.id === ultima.id) ultimaActividadRef.current = null
      await aiSay(`Listo, deshice "${ultima.title}". No quedo registrada.`)
    } else {
      await aiSay(motivos[resultado] ?? `No pude deshacer "${ultima.title}".`)
    }
  }

  /**
   * Pide confirmar antes de eliminar una actividad puntual (respondiendo su mensaje con
   * "borrala"/"eliminala"). A diferencia de deshacerUltima -rapido, sin preguntar, solo la
   * ULTIMA creada hace menos de 30 min- esto apunta a CUALQUIER actividad que el usuario
   * identifico respondiendo, sin ventana de tiempo. La seguridad no es "reciente y tuya":
   * es preguntar antes de borrar.
   */
  const solicitarEliminarActividad = async (activityId: string) => {
    const activity = await activitiesService.getById(activityId)
    if (!activity) {
      await aiSay('Esa actividad ya no existe.')
      return
    }
    const title = activity.title.replace(/^\[Ingesta\]\s*/, '')
    if (activity.status !== 'pendiente') {
      await aiSay(
        `No puedo eliminar "${title}": ya esta "${statusLabels[activity.status] ?? activity.status}". Si igual sobra, hazlo desde Actividades.`,
      )
      return
    }
    await aiSay(`¿Eliminar "${title}"? No se puede deshacer.`, null, {
      type: 'delete_confirm',
      activityId: activity.id,
      title,
    })
  }

  /** Confirmado desde el popout de delete_confirm (ChatPage). */
  const confirmarEliminarActividad = async (
    activityId: string,
    title: string,
    confirmMessageId?: string,
  ) => {
    try {
      await activitiesService.remove(activityId)
    } catch (err) {
      console.error('Eliminar actividad fallo:', err)
      await aiSay(`No pude eliminar "${title}" (revisa tus permisos).`)
      return
    }
    if (confirmMessageId) await resolveInteractive(confirmMessageId, `Eliminada "${title}"`)
    await aiSay(`🗑 Listo, elimine "${title}".`)
  }

  /** Responder a una actividad con "es un proyecto"/"creala como proyecto": pide confirmar
   * la conversion (elimina la actividad, crea el proyecto en su lugar). */
  const solicitarReclasificarProyecto = async (activityId: string) => {
    const activity = await activitiesService.getById(activityId)
    if (!activity) {
      await aiSay('Esa actividad ya no existe.')
      return
    }
    const title = activity.title.replace(/^\[Ingesta\]\s*/, '')
    if (activity.status !== 'pendiente') {
      await aiSay(
        `No puedo convertir "${title}" en proyecto: ya esta "${statusLabels[activity.status] ?? activity.status}".`,
      )
      return
    }
    const { nombre, primerPunto } = parseProyectoIntent(activity.description || title)
    await aiSay(
      `¿Convertir "${title}" en un proyecto (con subtareas)? Se elimina la actividad y se crea el proyecto en su lugar.`,
      null,
      {
        type: 'reclass_proyecto_confirm',
        activityId: activity.id,
        title,
        tema: nombre || title,
        comentarios: activity.description || title,
        primerPunto,
        plazo: activity.due_date,
        senderId: activity.created_by,
      },
    )
  }

  /** Confirmado desde el popout de reclass_proyecto_confirm (ChatPage). */
  const confirmarReclasificarProyecto = async (
    activityId: string,
    tema: string,
    comentarios: string,
    primerPunto: string | null,
    plazo: string | null,
    senderId: string,
    confirmMessageId?: string,
  ) => {
    // Primero se crea el proyecto y RECIEN si eso funciona se borra la actividad original.
    // Antes era al reves: si la creacion fallaba (ej. permisos insuficientes sobre
    // minute_items), la actividad ya estaba borrada y no quedaba nada en su lugar -perdida de
    // datos real, reportada por Sebastian con el caso analogo de ingesta.
    const creado = await createMinutaTopic(
      { tema, comentarios, plazo },
      [],
      senderId,
      undefined,
      'proyecto',
      primerPunto,
    )
    if (!creado) return
    try {
      await activitiesService.remove(activityId)
    } catch (err) {
      console.error('Reclasificar a proyecto: no pude eliminar la actividad original:', err)
      await aiSay(
        `Se creo el proyecto "${tema}", pero no pude eliminar la actividad original (revisa tus permisos): quedaron las dos.`,
      )
      if (confirmMessageId) await resolveInteractive(confirmMessageId, 'Convertido a proyecto')
      return
    }
    if (confirmMessageId) await resolveInteractive(confirmMessageId, 'Convertido a proyecto')
  }

  /** Responder a una actividad con "es una ingesta"/"pasala a ingesta": pide confirmar la
   * conversion (elimina la actividad, crea la solicitud de ingesta en su lugar). Caso real
   * reportado por Sebastian: "Revisar la KSBC 1" creada como actividad, luego "es una
   * ingesta" -la IA contestaba "no vi ningun cambio" porque el tipo no es un campo que sepa
   * actualizar. */
  const solicitarReclasificarIngesta = async (activityId: string) => {
    const activity = await activitiesService.getById(activityId)
    if (!activity) {
      await aiSay('Esa actividad ya no existe.')
      return
    }
    const title = activity.title.replace(/^\[Ingesta\]\s*/, '')
    if (activity.status !== 'pendiente') {
      await aiSay(
        `No puedo convertir "${title}" en solicitud de ingesta: ya esta "${statusLabels[activity.status] ?? activity.status}".`,
      )
      return
    }
    await aiSay(
      `¿Convertir "${title}" en una solicitud de Ingesta? Se elimina la actividad y se crea la solicitud en su lugar.`,
      null,
      {
        type: 'reclass_ingesta_confirm',
        activityId: activity.id,
        title,
        comentarios: activity.description || title,
        plazo: activity.due_date,
        senderId: activity.created_by,
      },
    )
  }

  /** Confirmado desde el popout de reclass_ingesta_confirm (ChatPage). */
  const confirmarReclasificarIngesta = async (
    activityId: string,
    title: string,
    comentarios: string,
    plazo: string | null,
    senderId: string,
    confirmMessageId?: string,
  ) => {
    // Primero se crea la solicitud y RECIEN si eso funciona se borra la actividad original
    // (mismo orden que confirmarReclasificarProyecto, arreglado por el mismo motivo: caso
    // real donde el insert en minute_items fallo por permisos y la actividad ya estaba
    // borrada, sin nada que la reemplazara).
    const creado = await createMinutaTopic(
      { tema: title, comentarios, plazo },
      [],
      senderId,
      undefined,
      'ingesta',
      null,
      null,
    )
    if (!creado) return
    try {
      await activitiesService.remove(activityId)
    } catch (err) {
      console.error('Reclasificar a ingesta: no pude eliminar la actividad original:', err)
      await aiSay(
        `Se creo la solicitud de ingesta "${title}", pero no pude eliminar la actividad original (revisa tus permisos): quedaron las dos.`,
      )
      if (confirmMessageId) await resolveInteractive(confirmMessageId, 'Convertido a ingesta')
      return
    }
    if (confirmMessageId) await resolveInteractive(confirmMessageId, 'Convertido a ingesta')
  }

  /** Responder a una actividad con "es un error"/"pasala a error": pide confirmar la
   * conversion (crea el error en la bitacora, elimina la actividad original si funciona).
   * Mismo patron que proyecto/ingesta, a pedido de Sebastian. */
  const solicitarReclasificarError = async (activityId: string) => {
    const activity = await activitiesService.getById(activityId)
    if (!activity) {
      await aiSay('Esa actividad ya no existe.')
      return
    }
    const title = activity.title.replace(/^\[Ingesta\]\s*/, '')
    if (activity.status !== 'pendiente') {
      await aiSay(
        `No puedo convertir "${title}" en error: ya esta "${statusLabels[activity.status] ?? activity.status}".`,
      )
      return
    }
    await aiSay(
      `¿Convertir "${title}" en un error de la bitacora? Se elimina la actividad y se crea el error en su lugar.`,
      null,
      {
        type: 'reclass_error_confirm',
        activityId: activity.id,
        title,
        comentarios: activity.description || title,
        senderId: activity.created_by,
      },
    )
  }

  /** Confirmado desde el popout de reclass_error_confirm (ChatPage). */
  const confirmarReclasificarError = async (
    activityId: string,
    title: string,
    comentarios: string,
    senderId: string,
    confirmMessageId?: string,
  ) => {
    // Mismo orden crear-primero-borrar-despues que proyecto/ingesta: si la creacion del error
    // fallara, la actividad original no se toca.
    let creado
    try {
      creado = await createErrorFromMessage({
        content: comentarios,
        title,
        severity: 'media',
        senderId,
      })
    } catch (err) {
      console.error('Reclasificar a error: no pude crear el error:', err)
      await aiSay('No pude convertir: no logre crear el error (revisa tus permisos).')
      return
    }
    if (!creado) return
    try {
      await activitiesService.remove(activityId)
    } catch (err) {
      console.error('Reclasificar a error: no pude eliminar la actividad original:', err)
      await aiSay(
        `Se creo el error "${title}" en la bitacora, pero no pude eliminar la actividad original (revisa tus permisos): quedaron las dos.`,
      )
      if (confirmMessageId) await resolveInteractive(confirmMessageId, 'Convertido a error')
      return
    }
    if (confirmMessageId) await resolveInteractive(confirmMessageId, 'Convertido a error')
  }

  /**
   * Anota una creacion sobre un dia cargado y reprograma el aviso.
   *
   * La espera es larga a proposito. Midiendo un caso real, la gente escribe una tarea cada
   * 10 a 23 segundos: con una ventana corta se avisaria entre mensaje y mensaje y volveriamos
   * a las interrupciones encadenadas. Como la actividad YA quedo creada, esperar no bloquea
   * nada: solo retrasa una sugerencia.
   */
  function registrarSobrecarga(e: {
    activityId: string
    title: string
    dueDate: string
    responsibleId: string
    responsibleName: string
    yaTenia: number
  }) {
    sobrecargaBufferRef.current.push(e)
    if (sobrecargaTimerRef.current) clearTimeout(sobrecargaTimerRef.current)
    sobrecargaTimerRef.current = setTimeout(() => {
      void emitirResumenSobrecarga()
    }, ESPERA_RESUMEN_SOBRECARGA)
  }

  /** Un aviso por persona y dia, con todo lo que se acumulo en ese rato. */
  async function emitirResumenSobrecarga() {
    const buffer = sobrecargaBufferRef.current
    sobrecargaBufferRef.current = []
    sobrecargaTimerRef.current = null
    if (!buffer.length || !teamId) return

    const grupos = new Map<string, typeof buffer>()
    for (const e of buffer) {
      const clave = `${e.responsibleId}|${e.dueDate.split('T')[0]}`
      grupos.set(clave, [...(grupos.get(clave) ?? []), e])
    }

    for (const items of grupos.values()) {
      const primero = items[0]
      const quien =
        primero.responsibleId === user?.id ? 'Tenias' : `${primero.responsibleName} tenia`
      const cuantas = items.length === 1 ? 'una actividad mas' : `${items.length} actividades mas`
      const pending: PendingLoteSobrecarga = {
        responsibleId: primero.responsibleId,
        responsibleName: primero.responsibleName,
        dia: primero.dueDate,
        yaTenia: primero.yaTenia,
        items: items.map((i) => ({ id: i.activityId, title: i.title })),
      }
      await appendAndSave({
        id: `ai-lote-${Date.now()}`,
        content: `⚠️ ${quien} ${primero.yaTenia} actividades para el ${formatDateLocal(primero.dueDate)} y ${items.length === 1 ? 'se sumo' : 'se sumaron'} ${cuantas}. Ya ${items.length === 1 ? 'quedo creada' : 'quedaron creadas'}; toca si quieres moverlas.`,
        sender_id: 'ai',
        category: null,
        created_at: new Date().toISOString(),
        team_id: teamId,
        sender: { full_name: 'Lumix', avatar_url: null },
        metadata: { type: 'overload_lote', pending },
      })
    }
  }
  emitirResumenSobrecargaRef.current = emitirResumenSobrecarga

  /** Mueve el lote N dias habiles. Devuelve la fecha nueva para poder confirmarla. */
  const moverLoteSobrecarga = async (
    pending: PendingLoteSobrecarga,
    diasHabiles: number,
    confirmMessageId?: string,
  ): Promise<string | null> => {
    const nueva = addBusinessDays(toLocalDate(pending.dia), diasHabiles).toISOString()
    try {
      for (const it of pending.items) {
        await activitiesService.update(it.id, { due_date: nueva })
      }
    } catch (err) {
      console.error('No pude mover el lote:', err)
      await aiSay('No pude mover las actividades. Intentalo desde el listado.')
      return null
    }
    if (confirmMessageId) {
      await resolveInteractive(confirmMessageId, `Movidas al ${formatDateLocal(nueva)}`)
    }
    return formatDateLocal(nueva)
  }

  /** Se decidio dejarlas donde estan. Queda registrado para que el aviso no reaparezca. */
  const dejarLoteSobrecarga = (confirmMessageId: string) =>
    resolveInteractive(confirmMessageId, 'Se dejaron en esa fecha')

  // Ultimos turnos del hilo, para que el clasificador entienda los mensajes que solo tienen
  // sentido con lo anterior. Sin esto, "y para la proxima" despues de una pregunta se lee
  // como una tarea nueva y termina creando una actividad que nadie pidio.
  //
  // Se excluye el mensaje que se esta clasificando: va aparte en el prompt.
  function recentHistory(exceptId: string): HistoryTurn[] {
    return messagesRef.current
      .filter((m) => m.id !== exceptId && !!m.content)
      .slice(-6)
      .map((m) => ({
        role: m.sender_id === 'ai' ? ('lumix' as const) : ('usuario' as const),
        text: m.content,
      }))
  }

  // Deja el id de la actividad en la metadata del mensaje que la origino, para que al
  // responder a ese mensaje (migracion 032) se sepa de que actividad se habla. Solo el
  // autor puede vincular su propio mensaje, asi que un mensaje ajeno no se toca.
  const linkSourceMessage = (messageId: string, activityId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, metadata: { ...(m.metadata ?? {}), activity_id: activityId } }
          : m,
      ),
    )
    void messagesService.linkActivity(messageId, activityId).catch((err) => {
      console.error('No pude vincular el mensaje con la actividad:', err)
    })
  }

  // Cierra una alerta interactiva ya resuelta: deja constancia de lo que se decidio y la
  // vuelve no clickeable. Antes se borraba del estado local, que alcanzaba solo porque el
  // mensaje no existia en la base; ahora que persiste, sin esto se podria volver a tocar
  // despues de recargar y crear la actividad dos veces.
  const resolveInteractive = async (messageId: string, resolution: string): Promise<boolean> => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, metadata: { ...(m.metadata ?? {}), resolved: true, resolution } }
          : m,
      ),
    )
    try {
      await messagesService.resolveInteractive(messageId, resolution)
      return true
    } catch (err) {
      // NO se traga el error: se revierte la marca local y se avisa.
      //
      // La funcion de la base solo deja marcar mensajes propios. Cuando el admin resolvia la
      // alerta de otra persona el rechazo se perdia en la consola: la actividad SI se creaba,
      // la alerta seguia pendiente, reaparecia, y se volvia a resolver. Resultado real: una
      // actividad duplicada a nombre de Manuel.
      console.error('No pude marcar la alerta como resuelta:', err)
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m
          const meta = { ...(m.metadata ?? {}) }
          delete meta.resolved
          delete meta.resolution
          return { ...m, metadata: meta }
        }),
      )
      return false
    }
  }

  const aiSay = (
    content: string,
    category: ChatMessage['category'] = null,
    metadata?: Record<string, unknown>,
  ) =>
    appendAndSave({
      id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      content,
      sender_id: 'ai',
      category,
      created_at: new Date().toISOString(),
      team_id: teamId,
      sender: { full_name: 'Lumix', avatar_url: null },
      metadata,
    })

  const memberName = (id?: string | null): string => {
    if (!id) return 'Sin asignar'
    if (id === user?.id) return profile?.full_name || 'Tu'
    return membersRef.current.find((m) => m.id === id)?.full_name || 'Alguien'
  }

  // Tarjeta interactiva de actividad (P2). content sirve de fallback si se recarga.
  const emitActivityCard = (activity: Activity, responsibleName: string, text: string) =>
    appendAndSave({
      id: `ai-card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      content: text,
      sender_id: 'ai',
      category: null,
      created_at: new Date().toISOString(),
      team_id: teamId,
      sender: { full_name: 'Lumix', avatar_url: null },
      metadata: {
        type: 'activity_card',
        activityId: activity.id,
        title: activity.title.replace(/^\[Ingesta\]\s*/, ''),
        responsibleName,
        dueDate: activity.due_date,
        status: activity.status,
        priority: activity.priority,
      },
    })

  const sendMessage = async (payload: SendMessagePayload) => {
    if (!user) return null
    setSending(true)

    const optimisticId = `opt-${Date.now()}`
    const optimisticMsg: ChatMessage = {
      id: optimisticId,
      content: payload.content,
      sender_id: user.id,
      category: payload.category,
      created_at: new Date().toISOString(),
      team_id: teamId,
      sender: { full_name: profile?.full_name ?? '', avatar_url: profile?.avatar_url ?? null },
      // reply_to tiene FK: si el mensaje citado todavia lleva un id temporal (no alcanzo a
      // guardarse) el insert fallaria y se perderia la respuesta entera. En ese caso se
      // manda sin FK: la cita se sigue viendo, porque el texto va en la copia.
      reply_to: isSavedId(payload.reply_to?.id) ? payload.reply_to!.id : null,
      metadata: payload.reply_to ? { reply_preview: payload.reply_to } : null,
    }

    setMessages((prev) => [...prev, optimisticMsg])

    let sentMessage: ChatMessage | null = null

    try {
      const sent = await messagesService.send({
        content: payload.content,
        sender_id: user.id,
        category: payload.category,
        team_id: teamId,
        reply_to: optimisticMsg.reply_to,
        metadata: optimisticMsg.metadata,
      })

      sentMessage = { ...sent, sender: optimisticMsg.sender }

      setMessages((prev) => prev.map((m) => (m.id === optimisticId ? sentMessage! : m)))
    } catch (err) {
      console.error('Failed to send message:', err)
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
    } finally {
      setSending(false)
    }

    return sentMessage
  }

  // Crea una actividad/ingesta ya con responsable resuelto. Notifica si es para otro.
  async function persistActivity(opts: {
    title: string
    description: string
    priority: number
    dueDate: string
    category: 'actividad' | 'ingesta'
    responsibleId: string
    responsibleName: string
    senderId: string
    silent?: boolean
    // Mensaje que dio origen a la actividad. Se vincula para que responderle despues
    // (migracion 032) apunte a esta actividad sin tener que adivinar cual es.
    sourceMessageId?: string
    // Decision de la IA que produjo esta actividad, para cerrar el circuito de telemetria.
    decisionId?: string | null
  }) {
    // `opts.category` nunca llega aca como 'ingesta': createActivityOrIngesta la intercepta y
    // resuelve por createMinutaTopic antes de siquiera considerar persistActivity (desde la
    // Fase 13, Ingesta es su propio tipo de minute_items, no una actividad con prefijo
    // "[Ingesta]" en el titulo -eso era el modelo viejo-). El parametro se mantiene solo por
    // consistencia de tipos con PendingActivity (name_confirm/overload reusan el mismo shape).
    const cleanTitle = opts.title

    const activity = await activitiesService.create({
      title: cleanTitle,
      description: opts.description,
      responsible_id: opts.responsibleId,
      priority: opts.priority,
      status: 'pendiente',
      due_date: opts.dueDate,
      dependencies: [],
      observations: '',
      team_id: teamId,
      created_by: opts.senderId,
    })

    // Best-effort: si falla, responder a ese mensaje cae al flujo de siempre (la IA
    // busca la actividad en la lista). No vale la pena romper la creacion por esto.
    if (opts.sourceMessageId) {
      linkSourceMessage(opts.sourceMessageId, activity.id)
    }

    // Cierra el circuito de ai_decisions: deja registrado a que fila termino apuntando lo
    // que predijo el modelo. Sin esto no hay forma de saber despues si acerto: la tabla
    // tenia 52 decisiones y ninguna ligada a su actividad.
    void aiDecisionsService.linkEntity(opts.decisionId ?? null, 'activities', activity.id)

    // Pasa a ser el sujeto del hilo y lo ultimo deshacible.
    ultimaActividadRef.current = { id: activity.id, title: cleanTitle }
    ultimaCreacionRef.current = { id: activity.id, title: cleanTitle }

    const assignedToOther = opts.responsibleId !== opts.senderId

    if (assignedToOther) {
      try {
        await notificationsService.send(opts.responsibleId, {
          title: 'Nueva actividad asignada',
          body: `"${cleanTitle}" - Entrega: ${formatDateLocal(opts.dueDate)}`,
          type: 'deadline_soon',
          metadata: { activity_id: activity.id },
        })
      } catch (err) {
        console.error('Notification send failed:', err)
      }
    }

    if (!opts.silent) {
      // La confirmacion SIEMPRE dice la fecha de entrega: es el dato que el usuario
      // acaba de decidir (o que Lumix eligio por el) y el que mas se revisa despues.
      const when = formatDateLocal(opts.dueDate)
      const reply = assignedToOther
        ? `✅ Actividad "${cleanTitle}" creada y asignada a ${opts.responsibleName}. Entrega: ${when}.`
        : `✅ Actividad "${cleanTitle}" creada. Entrega: ${when}.`
      // Confirmacion simple en texto (se persiste igual que se ve, sin discrepancia al recargar).
      //
      // Lleva el id de la actividad: este es el mensaje al que la gente le responde ("cambiala
      // al viernes"), asi que es el que tiene que saber de que actividad habla. Sin esto la
      // respuesta no encuentra objetivo y termina creando una actividad nueva con el texto
      // de la instruccion, que es exactamente lo que hay que evitar.
      await aiSay(reply, null, { activity_id: activity.id, title: cleanTitle })
      if (assignedToOther) {
        await aiSay(`📨 Notificacion enviada a ${opts.responsibleName}`)
      }
    }

    return activity
  }

  // Construye el objeto de cambios a partir de lo que devuelve la IA de update
  function buildUpdatesFromChanges(
    changes: PendingUpdate['changes'],
    action?: string,
  ): {
    updates: Partial<Activity>
    newResponsibleName?: string
    // Nombre que la IA leyo pero que no calza con nadie del equipo (o calza con
    // varios): hay que avisarlo, no descartarlo en silencio.
    unresolvedResponsible?: string
    unresolvedReason?: 'not_found' | 'ambiguous' | 'no_permission'
  } {
    const updates: Partial<Activity> = {}
    let newResponsibleName: string | undefined
    let unresolvedResponsible: string | undefined
    let unresolvedReason: 'not_found' | 'ambiguous' | 'no_permission' | undefined
    if (changes.status) updates.status = changes.status as ActivityStatus
    if (changes.priority) updates.priority = changes.priority
    if (changes.due_date) updates.due_date = changes.due_date
    if (changes.description) updates.description = changes.description
    // El titulo solo cambia si la IA marco explicitamente action="retitle". La 029 existe
    // porque un flujo reescribia titulos por su cuenta; no se repite por un campo suelto.
    if (changes.title && action === 'retitle') updates.title = changes.title
    if (changes.responsible) {
      if (!canAssignOthers) {
        unresolvedResponsible = changes.responsible
        unresolvedReason = 'no_permission'
      } else {
        const matches = matchMembers(changes.responsible, membersRef.current)
        if (matches.length === 1) {
          updates.responsible_id = matches[0].id
          newResponsibleName = matches[0].full_name
        } else {
          unresolvedResponsible = changes.responsible
          unresolvedReason = matches.length === 0 ? 'not_found' : 'ambiguous'
        }
      }
    }
    return { updates, newResponsibleName, unresolvedResponsible, unresolvedReason }
  }

  // De que actividad habla el mensaje al que se respondio.
  //
  // Tres fuentes, por orden de confianza:
  //   1. La copia guardada en la propia respuesta (siempre disponible, aunque el original
  //      haya quedado fuera de los ultimos 50 mensajes que carga el chat).
  //   2. Una tarjeta de actividad de Lumix: trae activityId en su metadata.
  //   3. El mensaje que origino la actividad: trae activity_id, puesto por la migracion 032.
  //
  // Si no hay ninguna, devuelve null y el mensaje sigue el flujo de siempre.
  // Responder al mensaje de confirmacion de un Proyecto ("Agregale subtareas respondiendo
  // este mensaje...") cuelga una subtarea nueva bajo ese proyecto. Antes esa promesa no
  // estaba conectada a nada (bug real reportado por Sebastian) -el mensaje de confirmacion
  // ahora lleva `metadata.proyectoId` (ver createMinutaTopic), y esto lo resuelve.
  function resolveRepliedProyectoId(message: ChatMessage): string | null {
    if (!message.reply_to) return null
    const target = messagesRef.current.find((m) => m.id === message.reply_to)
    const meta = target?.metadata as { type?: string; proyectoId?: string } | null | undefined
    return meta?.type === 'proyecto_confirm' ? (meta.proyectoId ?? null) : null
  }

  function resolveRepliedActivityId(message: ChatMessage): string | null {
    const preview = message.metadata?.reply_preview as { activityId?: string } | undefined
    if (preview?.activityId) return preview.activityId

    if (!message.reply_to) return null
    const target = messagesRef.current.find((m) => m.id === message.reply_to)
    const meta = target?.metadata as
      | { activityId?: string; activity_id?: string }
      | null
      | undefined
    return meta?.activityId ?? meta?.activity_id ?? null
  }

  // Aplica un cambio a una actividad ya identificada (llegamos aca respondiendo un mensaje).
  // Devuelve true si el mensaje quedo atendido, false si hay que seguir con el flujo normal.
  async function applyTargetedUpdate(
    activityId: string,
    content: string,
    history: HistoryTurn[] = [],
  ): Promise<boolean> {
    const activity = await activitiesService.getById(activityId)
    if (!activity) {
      // La actividad ya no existe: mejor decirlo que tratar el mensaje como una nueva.
      await aiSay('Esa actividad ya no existe.')
      return true
    }

    const memList = await ensureMembers()
    let upd
    try {
      upd = await resolveUpdate(
        content,
        [
          {
            title: activity.title,
            responsible: memberName(activity.responsible_id),
            status: activity.status,
            due_date: activity.due_date.split('T')[0],
            priority: activity.priority,
          },
        ],
        memList.map((m) => m.full_name),
        true,
        history,
      )
    } catch (err) {
      console.error('Targeted update failed:', err)
      return false
    }

    // Responder sin pedir nada ("gracias", "ok") no es un update: no se inventa un cambio
    // ni se crea una actividad nueva con ese texto.
    if (!upd.isUpdate) {
      await aiSay(`Anotado. No vi ningun cambio que aplicar a "${activity.title}".`)
      return true
    }

    const { updates, newResponsibleName, unresolvedResponsible, unresolvedReason } =
      buildUpdatesFromChanges(upd.changes, upd.action)
    await commitUpdate(activity, updates, {
      replyText: upd.reply,
      newResponsibleName,
      unresolvedResponsible,
      unresolvedReason,
    })
    return true
  }

  /**
   * Flujo de "esto edita una actividad existente": la IA elige cual de las abiertas y que
   * cambiar. Devuelve true si el mensaje quedo atendido.
   *
   * neverCreate cambia que pasa cuando no se logra identificar la actividad:
   *  - false (mensaje suelto): devuelve false y el mensaje sigue al flujo de creacion.
   *  - true (el usuario RESPONDIO a un mensaje): nunca devuelve false. Responder es hablar
   *    de algo que ya existe; si aca cayera a creacion, "cambiar la fecha al 23 de agosto"
   *    terminaria siendo una actividad nueva con ese titulo. Paso de verdad, cuatro veces.
   */
  async function runUpdateFlow(
    message: ChatMessage,
    content: string,
    neverCreate: boolean,
  ): Promise<boolean> {
    let open: Activity[]
    let upd: Awaited<ReturnType<typeof resolveUpdate>> | null = null

    // EL SUJETO IMPLICITO. Si el mensaje habla de "la", "esa", "ponle", sin nombrar nada, se
    // refiere a lo ultimo de lo que hablamos. Se resuelve igual que responder a un mensaje:
    // modo dirigido, sin lista y sin adivinanza.
    //
    // Se exige que NO nombre otra actividad: "mueve el reporte al viernes" nombra una y tiene
    // que pasar por el flujo normal, aunque tambien traiga un "el". Ante la duda, flujo
    // normal, que en el peor caso pregunta.
    const ultima = ultimaActividadRef.current
    if (ultima && content.length <= LARGO_MAXIMO_ANAFORA) {
      const abiertas = (await activitiesService.getByTeam(teamId)).filter(
        (a) => a.status !== 'completado',
      )
      const mencionadas = actividadesMencionadas(content, abiertas)
      const soloLaUltima =
        mencionadas.length === 0 || (mencionadas.length === 1 && mencionadas[0].id === ultima.id)
      if (
        soloLaUltima &&
        (await applyTargetedUpdate(ultima.id, content, recentHistory(message.id)))
      )
        return true
    }

    try {
      const memList = await ensureMembers()
      const acts = await activitiesService.getByTeam(teamId)
      const scope = canAssignOthers
        ? acts
        : acts.filter((a) => a.responsible_id === message.sender_id)
      open = scope.filter((a) => a.status !== 'completado')

      if (open.length) {
        upd = await resolveUpdate(
          content,
          open.map((a) => ({
            title: a.title,
            responsible: memberName(a.responsible_id),
            status: a.status,
            due_date: a.due_date.split('T')[0],
            priority: a.priority,
          })),
          memList.map((m) => m.full_name),
          false,
          recentHistory(message.id),
        )
      }
    } catch (err) {
      console.error('Update resolution failed:', err)
      if (!neverCreate) return false
      await aiSay('No pude procesar el cambio. Intentalo de nuevo.')
      return true
    }

    if (!open.length) {
      if (!neverCreate) return false
      await aiSay('No tienes actividades abiertas que cambiar.')
      return true
    }

    if (!upd?.isUpdate) {
      if (!neverCreate) return false
      // Respondio algo que no pide ningun cambio ("ok", "gracias").
      await aiSay('Anotado. No vi ningun cambio que aplicar.')
      return true
    }

    if (upd.targetIndex >= 0 && upd.targetIndex < open.length) {
      const { updates, newResponsibleName, unresolvedResponsible, unresolvedReason } =
        buildUpdatesFromChanges(upd.changes, upd.action)
      await commitUpdate(open[upd.targetIndex], updates, {
        replyText: upd.reply,
        newResponsibleName,
        unresolvedResponsible,
        unresolvedReason,
      })
    } else {
      // Ambiguo: preguntar a cual actividad se refiere
      const candidates = pickActivityCandidates(content, open).map((a) => ({
        id: a.id,
        title: a.title.replace(/^\[Ingesta\]\s*/, ''),
      }))
      await appendAndSave({
        id: `ai-actpick-${crypto.randomUUID()}`,
        content: '¿A cual actividad te refieres? Toca para elegir.',
        sender_id: 'ai',
        category: null,
        created_at: new Date().toISOString(),
        team_id: teamId,
        sender: { full_name: 'Lumix', avatar_url: null },
        metadata: {
          type: 'activity_pick',
          candidates,
          pending: { changes: upd.changes, action: upd.action, reply: upd.reply },
        },
      })
    }

    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, category: 'actividad' } : m)),
    )
    return true
  }

  // Pide al usuario que elija a quien reasignar, cuando el nombre que dijo no calza
  // con nadie del equipo (o calza con varios). Nunca se descarta la intencion en silencio.
  async function askReassignTarget(
    activity: Activity,
    typedName: string,
    reason: 'not_found' | 'ambiguous',
  ) {
    const members = await ensureMembers()
    const matches = reason === 'ambiguous' ? matchMembers(typedName, members) : members
    const cleanTitle = activity.title.replace(/^\[Ingesta\]\s*/, '')
    await appendAndSave(
      {
        id: `ai-reassign-${Date.now()}`,
        content:
          reason === 'not_found'
            ? `No encontre a "${typedName}" en el equipo. ¿A quien reasigno "${cleanTitle}"?`
            : `Hay varias personas que coinciden con "${typedName}". ¿A quien reasigno "${cleanTitle}"?`,
        sender_id: 'ai',
        category: null,
        created_at: new Date().toISOString(),
        team_id: teamId,
        sender: { full_name: 'Lumix', avatar_url: null },
        metadata: {
          type: 'name_confirm',
          candidates: matches.map((m) => ({ id: m.id, name: m.full_name })),
          reassign: { activityId: activity.id, title: cleanTitle },
        },
      },
      false,
    )
  }

  // Aplica cambios a una actividad existente, con control de rol y notificaciones.
  async function commitUpdate(
    activity: Activity,
    updates: Partial<Activity>,
    opts: {
      replyText?: string
      newResponsibleName?: string
      unresolvedResponsible?: string
      unresolvedReason?: 'not_found' | 'ambiguous' | 'no_permission'
    } = {},
  ) {
    // Colaborador/invitado: solo su propia actividad y no puede reasignar a terceros
    if (!canAssignOthers) {
      if (activity.responsible_id !== user?.id) {
        await aiSay('Solo puedes modificar tus propias actividades.')
        return null
      }
      if (updates.responsible_id && updates.responsible_id !== user?.id) {
        delete updates.responsible_id
      }
    }

    if (opts.unresolvedReason === 'no_permission') {
      await aiSay(
        `No puedes reasignar actividades a otras personas, asi que deje "${opts.unresolvedResponsible}" fuera del cambio.`,
      )
    }

    if (Object.keys(updates).length === 0) {
      // Si lo unico que pedia el mensaje era reasignar a alguien que no existe,
      // preguntamos a quien en vez de responder "no detecte cambios".
      if (opts.unresolvedResponsible && opts.unresolvedReason !== 'no_permission') {
        await askReassignTarget(activity, opts.unresolvedResponsible, opts.unresolvedReason!)
        return null
      }
      await aiSay('No detecte ningun cambio para aplicar.')
      return null
    }

    let updated: Activity
    try {
      updated = await activitiesService.update(activity.id, updates)
    } catch (err) {
      console.error('Update failed:', err)
      await aiSay('No pude actualizar la actividad. Intentalo de nuevo.')
      return null
    }

    // Corregir el titulo o la descripcion poco despues de crear la actividad es la forma
    // real en que la gente le dice a Lumix que se equivoco. Se registra como correccion
    // para que despues sirva de ejemplo; el popout de categoria casi nunca se usa.
    if (updates.title || updates.description) {
      void aiDecisionsService.markCorrectionByEntity('activities', activity.id, {
        source: 'edicion_manual',
      })
    }

    ultimaActividadRef.current = {
      id: updated.id,
      title: updated.title.replace(/^\[Ingesta\]\s*/, ''),
    }

    if (updates.status === 'bloqueado') {
      try {
        // Solo a quien puede desbloquearla: jefatura del equipo y el responsable.
        await notificationsService.sendToTeam(
          teamId,
          {
            title: 'Actividad bloqueada',
            body: `"${updated.title}" fue bloqueada`,
            type: 'activity_blocked',
            metadata: { activity_id: updated.id },
          },
          {
            exceptUserId: user?.id,
            roles: ['admin', 'jefatura'],
            alsoUserIds: [updated.responsible_id],
          },
        )
      } catch (err) {
        console.error('Block notify failed:', err)
      }
    }
    if (updates.responsible_id && updates.responsible_id !== activity.responsible_id) {
      try {
        await notificationsService.send(updates.responsible_id, {
          title: 'Actividad reasignada',
          body: `"${updated.title}" - Entrega: ${formatDateLocal(updated.due_date)}`,
          type: 'deadline_soon',
          metadata: { activity_id: updated.id },
        })
      } catch (err) {
        console.error('Reassign notify failed:', err)
      }
    }

    const rName = opts.newResponsibleName || memberName(updated.responsible_id)
    await emitActivityCard(updated, rName, opts.replyText || 'Actividad actualizada.')

    // El resto de los cambios ya se aplico; ahora si, preguntamos por el responsable.
    if (opts.unresolvedResponsible && opts.unresolvedReason !== 'no_permission') {
      await askReassignTarget(updated, opts.unresolvedResponsible, opts.unresolvedReason!)
    }
    return updated
  }

  // Actualizacion pendiente confirmada desde el chat (cuando la IA no supo cual era)
  const applyPendingUpdate = async (
    activityId: string,
    pending: PendingUpdate,
    confirmMessageId?: string,
  ) => {
    const activity = await activitiesService.getById(activityId)
    if (!activity) {
      await aiSay('No encontre la actividad.')
      return null
    }
    if (confirmMessageId) {
      await resolveInteractive(
        confirmMessageId,
        `Aplicado a "${activity.title.replace(/^\[Ingesta\]\s*/, '')}"`,
      )
    }
    const { updates, newResponsibleName, unresolvedResponsible, unresolvedReason } =
      buildUpdatesFromChanges(pending.changes, pending.action)
    return commitUpdate(activity, updates, {
      replyText: pending.reply,
      newResponsibleName,
      unresolvedResponsible,
      unresolvedReason,
    })
  }

  // Reasignacion confirmada desde el popout (el nombre dicho no existia o era ambiguo)
  const reassignResolved = async (
    activityId: string,
    responsibleId: string,
    responsibleName: string,
    confirmMessageId?: string,
  ) => {
    const activity = await activitiesService.getById(activityId)
    if (!activity) {
      await aiSay('No encontre la actividad.')
      return null
    }
    if (confirmMessageId) {
      await resolveInteractive(confirmMessageId, `Reasignada a ${responsibleName}`)
    }
    const title = activity.title.replace(/^\[Ingesta\]\s*/, '')
    return commitUpdate(
      activity,
      { responsible_id: responsibleId },
      {
        replyText: `Actividad "${title}" reasignada a ${responsibleName}.`,
        newResponsibleName: responsibleName,
      },
    )
  }

  // Accion directa desde los botones de la tarjeta (sin IA)
  const quickUpdate = async (activityId: string, changes: QuickChanges) => {
    const activity = await activitiesService.getById(activityId)
    if (!activity) return null
    const updates: Partial<Activity> = {}
    if (changes.status) updates.status = changes.status
    if (changes.due_date) updates.due_date = changes.due_date
    if (changes.priority) updates.priority = changes.priority
    if (changes.responsibleId) updates.responsible_id = changes.responsibleId

    const title = activity.title.replace(/^\[Ingesta\]\s*/, '')
    let replyText = 'Actividad actualizada.'
    if (changes.status === 'completado') replyText = `Actividad "${title}" completada. ✅`
    else if (changes.status)
      replyText = `Actividad "${title}" ahora esta: ${STATUS_LABELS[changes.status] ?? changes.status}.`
    else if (changes.due_date)
      replyText = `Actividad "${title}" movida al ${new Date(changes.due_date + 'T12:00:00').toLocaleDateString('es-CL')}.`
    else if (changes.responsibleId)
      replyText = `Actividad "${title}" reasignada a ${changes.responsibleName ?? 'otro miembro'}.`
    else if (changes.priority) replyText = `Actividad "${title}" con prioridad ${changes.priority}.`

    return commitUpdate(activity, updates, {
      replyText,
      newResponsibleName: changes.responsibleName,
    })
  }

  // Accion masiva desde la seleccion multiple del listado (activity_list). A diferencia de
  // quickUpdate, NO pasa por commitUpdate: con varias decenas de filas seleccionadas eso
  // dejaria una tarjeta de actividad POR CADA UNA en el chat. Mismo patron que
  // moverLoteSobrecarga: se actualiza directo y se deja un solo mensaje resumen al final.
  const bulkQuickUpdate = async (activityIds: string[], changes: QuickChanges) => {
    const updates: Partial<Activity> = {}
    if (changes.status) updates.status = changes.status
    if (changes.due_date) updates.due_date = changes.due_date
    if (changes.responsibleId) updates.responsible_id = changes.responsibleId

    let ok = 0
    let skipped = 0
    for (const id of activityIds) {
      const activity = await activitiesService.getById(id)
      // Colaborador/invitado: igual que commitUpdate, solo puede tocar lo suyo.
      if (!activity || (!canAssignOthers && activity.responsible_id !== user?.id)) {
        skipped++
        continue
      }
      try {
        await activitiesService.update(id, updates)
        ok++
        if (changes.responsibleId && changes.responsibleId !== activity.responsible_id) {
          await notificationsService
            .send(changes.responsibleId, {
              title: 'Actividad reasignada',
              body: `"${activity.title.replace(/^\[Ingesta\]\s*/, '')}"`,
              type: 'deadline_soon',
              metadata: { activity_id: id },
            })
            .catch((err) => console.error('Bulk reassign notify failed:', err))
        }
      } catch (err) {
        console.error('Bulk update item failed:', err)
        skipped++
      }
    }

    const plural = (n: number) => (n === 1 ? '' : 'es')
    let summary: string
    if (changes.status === 'completado')
      summary = `✅ ${ok} actividad${plural(ok)} completada${plural(ok)}.`
    else if (changes.due_date)
      summary = `📅 ${ok} actividad${plural(ok)} movida${plural(ok)} al ${formatDateLocal(changes.due_date)}.`
    else if (changes.responsibleId)
      summary = `${ok} actividad${plural(ok)} reasignada${plural(ok)} a ${changes.responsibleName ?? 'otro miembro'}.`
    else summary = `${ok} actividad${plural(ok)} actualizada${plural(ok)}.`
    if (skipped) summary += ` ${skipped} no se pudo${skipped === 1 ? '' : 'ieron'} actualizar.`
    await aiSay(summary)
  }

  // Edicion completa desde el modal del listado (prioridad, fecha, descripcion, estado)
  const editActivityFields = async (
    activityId: string,
    changes: {
      priority?: number
      due_date?: string
      description?: string
      status?: ActivityStatus
      responsibleId?: string
    },
  ) => {
    const activity = await activitiesService.getById(activityId)
    if (!activity) return null
    const updates: Partial<Activity> = {}
    if (changes.priority) updates.priority = changes.priority
    if (changes.due_date) updates.due_date = changes.due_date
    if (changes.description !== undefined) updates.description = changes.description
    if (changes.status) updates.status = changes.status
    if (changes.responsibleId) updates.responsible_id = changes.responsibleId
    const title = activity.title.replace(/^\[Ingesta\]\s*/, '')
    return commitUpdate(activity, updates, { replyText: `Actividad "${title}" actualizada.` })
  }

  const listMembers = () => ensureMembers()

  // Llamada desde la UI cuando el usuario confirma a quien asignar (flujo name_confirm)
  const createResolvedActivity = async (
    pending: PendingActivity,
    responsibleId: string,
    responsibleName: string,
    confirmMessageId?: string,
  ) => {
    // La pregunta queda marcada como resuelta: si no, se puede volver a tocar y crear
    // duplicados. Primero se crea; si falla, la pregunta sigue disponible para reintentar.
    const created = await persistActivity({
      title: pending.title,
      description: pending.description,
      priority: pending.priority,
      dueDate: pending.dueDate,
      category: pending.category,
      responsibleId,
      responsibleName,
      senderId: pending.senderId,
      sourceMessageId: pending.sourceMessageId,
      decisionId: pending.decisionId,
    })
    if (confirmMessageId) {
      await resolveInteractive(confirmMessageId, `Asignada a ${responsibleName}`)
    }
    return created
  }

  // Crea un tema de minuta desde el chat, ya con responsables resueltos (o sin ellos).
  // Notifica a cada asignado igual que una actividad: si no, el tema queda invisible para el.
  const createMinutaTopic = async (
    topic: PendingMinuta,
    responsables: { id: string; name: string }[],
    senderId: string,
    confirmMessageId?: string,
    tipo: HojaTipo = 'minuta',
    // Si alguien dicto el proyecto Y su primer punto en el mismo mensaje ("...primer punto,
    // revisar X"), se cuelga como su primera subtarea apenas se crea la raiz.
    primerPunto?: string | null,
    // Ingesta usa responsable en TEXTO LIBRE (Fase 13: puede ser alguien de otro equipo, o
    // externo) en vez de `responsables` (ids de miembros del equipo activo). Cuando viene
    // seteado, reemplaza el nombre armado a partir de `responsables`.
    responsableTextoLibre?: string | null,
  ) => {
    const esProyecto = tipo === 'proyecto'
    const esIngesta = tipo === 'ingesta'
    const responsableNames = responsableTextoLibre ?? responsables.map((r) => r.name).join(', ')
    let creado
    try {
      // orden = al final de la lista DE ESE TIPO (antes todos entraban con orden 0 y
      // quedaban empatados; y contar contra el tipo equivocado desordenaba el otro).
      const existing = await minutesService.getByTeam(teamId, tipo)
      creado = await minutesService.create({
        team_id: teamId,
        tipo,
        orden: existing.length,
        tema: topic.tema,
        para_todos: false,
        responsables: responsables.map((r) => r.id),
        responsables_text: responsableNames,
        // `estado` no se usa para Ingesta (columna NOT NULL, se llena igual); estado_ingesta
        // es el que de verdad importa para esa hoja (mismo criterio que useMinuta.addItem).
        estado: 'pendiente',
        estado_ingesta: esIngesta ? 'no_iniciado' : null,
        plazo: topic.plazo,
        comentarios: topic.comentarios === topic.tema ? '' : topic.comentarios,
        linked_activity_ids: [],
        created_by: senderId,
      })
    } catch (err) {
      console.error('Minuta topic failed:', err)
      await aiSay('No pude agregar el tema a la minuta (revisa tus permisos).')
      return null
    }

    if (esProyecto && primerPunto) {
      try {
        await minutesService.create({
          team_id: teamId,
          tipo,
          orden: 0,
          tema: primerPunto,
          para_todos: false,
          responsables: [],
          responsables_text: '',
          estado: 'pendiente',
          plazo: null,
          comentarios: '',
          linked_activity_ids: [],
          created_by: senderId,
          parent_item_id: creado.id,
        })
      } catch (err) {
        console.error('Primer punto del proyecto fallo:', err)
      }
    }

    if (confirmMessageId) {
      await resolveInteractive(
        confirmMessageId,
        responsables.length ? `Tema asignado a ${responsableNames}` : 'Tema agregado a la minuta',
      )
    }

    const parts = [
      esProyecto
        ? `✅ Proyecto creado: "${topic.tema}"`
        : esIngesta
          ? `✅ Solicitud de ingesta creada: "${topic.tema}"`
          : `✅ Tema agregado a la minuta: "${topic.tema}"`,
    ]
    if (teamNameRef.current) parts.push(`Equipo: ${teamNameRef.current}`)
    if (esIngesta) {
      // Responsable de Ingesta es texto libre (puede ser de otro equipo o externo): no aplica
      // el aviso de "revisa que sea miembro" que sí tiene sentido para Minuta/Proyecto.
      parts.push(responsableNames ? `Responsable: ${responsableNames}` : 'Sin responsable asignado')
    } else if (responsables.length) {
      parts.push(`Responsable${responsables.length > 1 ? 's' : ''}: ${responsableNames}`)
    } else {
      // Si el mensaje nombraba a alguien y no se pudo asignar, avisar es mejor que el
      // silencio: la causa mas comun es que esa persona no es miembro del equipo activo
      // (caso real: alguien nombro a colegas de OTRO equipo mientras dictaba con este activo).
      parts.push(
        `Sin responsable asignado (si nombraste a alguien, revisa que sea miembro de "${teamNameRef.current || 'este equipo'}")`,
      )
    }
    if (topic.plazo)
      parts.push(`${esIngesta ? 'Fecha de compromiso' : 'Plazo'}: ${formatDateLocal(topic.plazo)}`)
    if (esProyecto) {
      parts.push(
        primerPunto
          ? `Primer punto: "${primerPunto}"`
          : 'Agrégale subtareas respondiendo este mensaje o desde Proyectos',
      )
    }
    // metadata.proyectoId: sin esto, responder este mensaje ("Agregale subtareas
    // respondiendo...") no tenia forma de saber a que proyecto se referia -el texto lo
    // prometia pero no estaba conectado a nada (bug real reportado por Sebastian). Se
    // resuelve en classifyAndAct via resolveRepliedProyectoId.
    await aiSay(
      parts.join('. ') + '.',
      null,
      esProyecto ? { type: 'proyecto_confirm', proyectoId: creado.id } : undefined,
    )

    for (const r of responsables) {
      if (r.id === senderId) continue
      try {
        await notificationsService.send(r.id, {
          title: esProyecto ? 'Nuevo proyecto' : 'Nuevo tema en la minuta',
          body: topic.plazo
            ? `"${topic.tema}" - Plazo: ${formatDateLocal(topic.plazo)}`
            : `"${topic.tema}"`,
          // El tipo esta acotado por un CHECK en la tabla; deadline_soon es el que ya
          // usa la minuta al generar actividades (ver useMinuta).
          type: 'deadline_soon',
          metadata: { minuta: true },
        })
        await aiSay(`📨 Notificacion enviada a ${r.name}`)
      } catch (err) {
        console.error('Minuta notify failed:', err)
      }
    }
    return creado
  }

  // Resuelve la alerta de sobrecarga: crea la actividad con la fecha que eligio el usuario.
  // Pasa por persistActivity para que notifique al responsable y confirme en el chat igual
  // que cualquier otra creacion (antes se insertaba directo y no avisaba a nadie).
  const createOverloadActivity = async (
    pending: PendingOverload,
    extraBusinessDays: number,
    confirmMessageId?: string,
  ) => {
    const dueDate =
      extraBusinessDays > 0
        ? addBusinessDays(toLocalDate(pending.dueDate), extraBusinessDays).toISOString()
        : pending.dueDate

    try {
      await persistActivity({
        title: pending.title,
        description: pending.description,
        priority: pending.priority,
        dueDate,
        category: pending.category,
        responsibleId: pending.responsibleId,
        responsibleName: pending.responsibleName,
        senderId: pending.senderId,
        sourceMessageId: pending.sourceMessageId,
        decisionId: pending.decisionId,
      })
      // Solo se marca resuelta si la actividad quedo creada: si falla, la alerta sigue viva
      // y se puede reintentar.
      if (confirmMessageId) {
        const marcada = await resolveInteractive(
          confirmMessageId,
          `Creada para el ${formatDateLocal(dueDate)}`,
        )
        if (!marcada) {
          // La actividad SI quedo creada; lo que fallo es cerrar la alerta. Hay que decirlo,
          // porque si no la alerta reaparece y alguien la resuelve otra vez.
          await aiSay(
            'La actividad quedo creada, pero no pude cerrar la alerta: es de otra conversacion. ' +
              'Solo su dueño puede cerrarla.',
          )
        }
      }
      return formatDateLocal(dueDate)
    } catch (err) {
      console.error('Overload activity create failed:', err)
      await aiSay('No pude crear la actividad. Intentalo de nuevo.')
      return null
    }
  }

  // Carga masiva: crea varias actividades tras confirmacion en la UI
  const bulkCreate = async (items: BulkActivity[]) => {
    if (!user) return 0
    const members = await ensureMembers()
    let created = 0
    const unmatched = new Set<string>()

    for (const it of items) {
      let responsibleId = user.id
      let responsibleName = profile?.full_name ?? ''

      if (canAssignOthers && it.responsible) {
        const matches = matchMembers(it.responsible, members)
        if (matches.length === 1) {
          responsibleId = matches[0].id
          responsibleName = matches[0].full_name
        } else {
          // Ambiguo o inexistente: queda con quien lo crea, pero se reporta al final
          // para que se pueda corregir (antes se perdia el nombre sin dejar rastro).
          unmatched.add(it.responsible)
        }
      }

      try {
        await persistActivity({
          title: it.title || it.description?.slice(0, 100) || 'Actividad',
          description: it.description || it.title || '',
          priority: it.priority ?? 2,
          dueDate: it.due_date || defaultDueDate(),
          category: 'actividad',
          responsibleId,
          responsibleName,
          senderId: user.id,
          silent: true,
        })
        created++
      } catch (err) {
        console.error('Bulk item failed:', err)
      }
    }

    await aiSay(`✅ Carga masiva: ${created} de ${items.length} actividades creadas.`, 'actividad')
    if (unmatched.size) {
      await aiSay(
        `⚠️ No encontre en el equipo a: ${[...unmatched].join(', ')}. Esas actividades quedaron a tu nombre; reasignalas desde el listado.`,
      )
    }
    return created
  }

  // Muestra una tabla editable de actividades filtrada por persona/periodo.
  async function showActivityList(
    content: string,
    senderId: string,
    preloaded?: { activities: Activity[]; members: Member[] },
  ) {
    const activities = preloaded?.activities ?? (await activitiesService.getByTeam(teamId))
    const members = preloaded?.members ?? (await ensureMembers())
    membersRef.current = members

    const visible = isColaborador
      ? activities.filter((a) => a.responsible_id === senderId)
      : activities

    const mentioned = findMentionedMembers(content, members)
    const wantsSelf = /\b(mis|tengo|mias)\b/i.test(normalizeName(content))
    const tf = parseTimeframe(content)
    const wantsCompleted = /complet/i.test(content)

    let list = visible.filter((a) => !a.title.startsWith('[Ingesta]'))
    let scopeLabel = ''

    if (mentioned.length === 1 && !isColaborador) {
      list = list.filter((a) => a.responsible_id === mentioned[0].id)
      scopeLabel = mentioned[0].full_name
    } else if (wantsSelf || isColaborador) {
      list = list.filter((a) => a.responsible_id === senderId)
      scopeLabel = 'tuyas'
    }

    if (tf) list = list.filter((a) => dueWithin(a.due_date, tf))
    if (!wantsCompleted) list = list.filter((a) => a.status !== 'completado')

    list.sort(
      (a, b) =>
        new Date(a.due_date.split('T')[0]).getTime() - new Date(b.due_date.split('T')[0]).getTime(),
    )

    if (list.length === 0) {
      await aiSay('No encontre actividades que coincidan con tu consulta.')
      return
    }

    const n = normalizeName(content)
    const tfLabel = /esta semana/.test(n)
      ? ' de esta semana'
      : /proxima semana/.test(n)
        ? ' de la proxima semana'
        : /\bhoy\b/.test(n)
          ? ' de hoy'
          : /\bmanana\b/.test(n)
            ? ' de manana'
            : ''
    const who = scopeLabel === 'tuyas' ? 'Tienes' : scopeLabel ? `${scopeLabel} tiene` : 'Hay'
    await appendAndSave({
      id: `ai-list-${Date.now()}`,
      content: `${who} ${list.length} actividad${list.length === 1 ? '' : 'es'}${tfLabel}. Toca una para editarla.`,
      sender_id: 'ai',
      category: null,
      created_at: new Date().toISOString(),
      team_id: teamId,
      sender: { full_name: 'Lumix', avatar_url: null },
      metadata: {
        type: 'activity_list',
        activities: list.map((a) => ({
          id: a.id,
          title: a.title,
          responsibleId: a.responsible_id,
          responsibleName: memberName(a.responsible_id),
          dueDate: a.due_date,
          status: a.status,
          priority: a.priority,
          description: a.description,
        })),
      },
    })
  }

  // Registra un error en la bitacora a partir de un mensaje ya clasificado como error.
  async function createErrorFromMessage(opts: {
    content: string
    title: string
    severity: string
    senderId: string
    sourceMessageId?: string
    decisionId?: string | null
  }) {
    const error = await errorsService.create({
      title: opts.title,
      description: opts.content,
      severity: (opts.severity as 'baja' | 'media' | 'alta' | 'critica') || 'media',
      responsible_id: opts.senderId,
      // Arranca directo en "En proceso" (en_revision), sin pasar por 'abierto' -mismo criterio
      // que createError en useErrors.ts, unificado a pedido de Sebastian.
      status: 'en_revision',
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 8),
      team_id: teamId,
      created_by: opts.senderId,
    })
    void aiDecisionsService.linkEntity(opts.decisionId ?? null, 'errors', error.id)
    await aiSay(
      `Error "${error.title}" registrado en bitacora. Severidad: ${error.severity}.`,
      'error',
    )
    if (opts.sourceMessageId) {
      setMessages((prev) =>
        prev.map((m) => (m.id === opts.sourceMessageId ? { ...m, category: 'error' } : m)),
      )
    }
    return error
  }

  // Crea actividad o ingesta: resuelve responsable, chequea sobrecarga y persiste.
  // Puede abrir popouts (name_confirm / overload) si hace falta antes de crear.
  async function createActivityOrIngesta(opts: {
    content: string
    title: string
    actCategory: 'actividad' | 'ingesta'
    priority: number
    dueDate: string
    senderId: string
    responsibleHint?: string | null
    sourceMessageId?: string
    // Decision de la IA que produjo esta creacion. Se arrastra para poder ligar la fila
    // creada con lo que el modelo predijo (ai_decisions.entity_id).
    decisionId?: string | null
  }) {
    const { content, title, actCategory, dueDate, senderId } = opts

    // Ingesta NO vive en `activities` (eso era el modelo viejo, [Ingesta] como prefijo del
    // titulo -las 12 filas fantasma que se borraron al simplificar IngestasTabs, invisibles
    // desde que /ingestas lee minute_items). Desde la Fase 13, Ingesta es su propio tipo de
    // minute_items, con responsable en TEXTO LIBRE (puede ser de otro equipo o externo), asi
    // que no corresponde el matching de miembros/sobrecarga que sigue abajo para actividad.
    if (actCategory === 'ingesta') {
      const creado = await createMinutaTopic(
        { tema: title, comentarios: content, plazo: dueDate },
        [],
        senderId,
        undefined,
        'ingesta',
        null,
        opts.responsibleHint ?? null,
      )
      if (creado)
        void aiDecisionsService.linkEntity(opts.decisionId ?? null, 'minute_items', creado.id)
      if (opts.sourceMessageId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === opts.sourceMessageId ? { ...m, category: null } : m)),
        )
      }
      return
    }

    const { priority } = opts
    const members = await ensureMembers()

    let responsibleId = senderId
    let responsibleName = profile?.full_name ?? ''

    // Sin permiso para asignar a terceros: si el mensaje nombraba a otra persona,
    // se avisa en vez de crearla en silencio a nombre de quien escribe.
    if (!canAssignOthers && opts.responsibleHint) {
      const self = matchMembers(opts.responsibleHint, members).some((m) => m.id === senderId)
      const saysSelf = /^(yo|mi|mio|mia)$/i.test(normalizeName(opts.responsibleHint))
      if (!self && !saysSelf) {
        await aiSay(
          `No puedes asignar actividades a otras personas, asi que "${title}" queda a tu nombre.`,
        )
      }
    }

    if (canAssignOthers && opts.responsibleHint) {
      const matches = matchMembers(opts.responsibleHint, members)
      if (matches.length === 1) {
        responsibleId = matches[0].id
        responsibleName = matches[0].full_name
      } else {
        // 0 o >1 coincidencias => preguntar en el chat y NO crear todavia
        const notFound = matches.length === 0
        const candidates = (notFound ? members : matches).map((m) => ({
          id: m.id,
          name: m.full_name,
        }))
        const pending: PendingActivity = {
          title,
          description: content,
          priority,
          dueDate,
          category: actCategory,
          senderId,
          sourceMessageId: opts.sourceMessageId,
          decisionId: opts.decisionId,
        }
        await appendAndSave({
          id: `ai-nameconfirm-${Date.now()}`,
          content: notFound
            ? `No encontre a "${opts.responsibleHint}" en el equipo. ¿A quien asigno "${title}"? Toca para elegir.`
            : `Hay varias personas que coinciden con "${opts.responsibleHint}". ¿A quien asigno "${title}"? Toca para elegir.`,
          sender_id: 'ai',
          category: null,
          created_at: new Date().toISOString(),
          team_id: teamId,
          sender: { full_name: 'Lumix', avatar_url: null },
          metadata: { type: 'name_confirm', candidates, pending },
        })
        if (opts.sourceMessageId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === opts.sourceMessageId ? { ...m, category: 'actividad' } : m)),
          )
        }
        return
      }
    }

    // Chequeo de carga del dia (solo actividad normal, no ingesta). No bloquea: anota.
    let sobrecargaDetectada: {
      yaTenia: number
      responsibleId: string
      responsibleName: string
    } | null = null
    if (actCategory === 'actividad' && teamId) {
      try {
        const userActivities = await activitiesService.getByTeam(teamId)
        const dueDateStr = dueDate.split('T')[0]
        const sameDay = userActivities.filter(
          (a) =>
            a.responsible_id === responsibleId &&
            a.status !== 'completado' &&
            a.due_date.startsWith(dueDateStr),
        )
        // 0 = el equipo desactivo el aviso.
        const umbral = umbralRef.current
        // Ya NO se detiene la creacion. Antes la alerta bloqueaba: si nadie decidia, la
        // actividad no existia. Paso de verdad -alguien escribio la tarea, cerro la ventana y
        // el trabajo no quedo registrado en ninguna parte-.
        //
        // Ahora se crea igual y la carga se avisa DESPUES, agrupada. Nadie pierde trabajo por
        // no contestar una ventana, y cinco mensajes seguidos ya no producen cinco
        // interrupciones encadenadas.
        if (umbral > 0 && sameDay.length >= umbral) {
          sobrecargaDetectada = { yaTenia: sameDay.length, responsibleId, responsibleName }
        }
      } catch (err) {
        console.error('Overload check failed:', err)
      }
    }

    const creada = await persistActivity({
      title,
      description: content,
      priority,
      dueDate,
      category: actCategory,
      responsibleId,
      responsibleName,
      senderId,
      sourceMessageId: opts.sourceMessageId,
      decisionId: opts.decisionId,
    })

    if (sobrecargaDetectada && creada) {
      registrarSobrecarga({
        activityId: creada.id,
        title,
        dueDate,
        ...sobrecargaDetectada,
      })
    }

    if (opts.sourceMessageId) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === opts.sourceMessageId ? { ...m, category: 'actividad' as const } : m,
        ),
      )
    }
  }

  // Resuelve el popout de categoria ambigua: el usuario elige que es realmente el mensaje.
  // confirmMessageId es el mensaje-pregunta de Lumix: se marca resuelto para que NO se
  // pueda volver a tocar y crear duplicados. Se marca antes de actuar porque la eleccion ya
  // esta hecha, y porque el flujo que sigue puede abrir otra pregunta (responsable, sobrecarga).
  const confirmCategory = async (
    pending: PendingCategory,
    choice: 'actividad' | 'ingesta' | 'error' | 'proyecto',
    confirmMessageId?: string,
  ) => {
    if (confirmMessageId) {
      await resolveInteractive(confirmMessageId, `Registrado como ${choice}`)
    }

    // Si el usuario eligio algo distinto a lo que predijo la IA, queda registrado.
    // Esta es la senal mas valiosa que produce el chat: donde se equivoca el modelo.
    if (pending.decisionId && pending.predictedCategory && pending.predictedCategory !== choice) {
      void aiDecisionsService.markCorrection(pending.decisionId, {
        finalCategory: choice,
        source: 'popout',
      })
    }

    if (choice === 'error') {
      return createErrorFromMessage({
        content: pending.content,
        title: pending.title,
        severity: pending.severity ?? 'media',
        senderId: pending.senderId,
        sourceMessageId: pending.sourceMessageId,
        decisionId: pending.decisionId,
      })
    }
    if (choice === 'proyecto') {
      // Mismo parseo dedicado que usa la deteccion automatica: separa nombre de primer
      // punto si vinieron juntos, en vez de usar el titulo de la IA (pensado para actividad).
      const { nombre, primerPunto } = parseProyectoIntent(pending.content)
      return createMinutaTopic(
        { tema: nombre, comentarios: pending.content, plazo: pending.dueDate },
        [],
        pending.senderId,
        undefined,
        'proyecto',
        primerPunto,
      )
    }
    return createActivityOrIngesta({
      content: pending.content,
      title: pending.title,
      actCategory: choice,
      priority: pending.priority,
      dueDate: pending.dueDate,
      senderId: pending.senderId,
      responsibleHint: pending.responsibleHint,
      sourceMessageId: pending.sourceMessageId,
      decisionId: pending.decisionId,
    })
  }

  const classifyAndAct = async (message: ChatMessage, forcedType?: string) => {
    if (!message.content || message.category) return
    setAiProcessing(true)

    const content = message.content.trim()
    // Se usa mas abajo tambien para detectar "crea un proyecto" en Auto, asi que se calcula
    // aca arriba en vez de mas adelante (donde vivia antes, solo para la rama de preguntas).
    const isAutoMode = !forcedType || forcedType === 'auto'

    try {
      // AYUDA: va antes que todo lo demas, incluso una respuesta citada -si alguien escribe
      // "ayuda" respondiendo cualquier mensaje, sigue queriendo el resumen, no un intento de
      // "actualizar" lo citado con la palabra "ayuda".
      if (AYUDA_RE.test(content)) {
        await aiSay(MENSAJE_AYUDA)
        setAiProcessing(false)
        return
      }

      // RESPUESTA A UN MENSAJE: si se sabe de que actividad habla el mensaje citado, no hay
      // nada que adivinar. Se salta la lista, el targetIndex y el popout de "¿a cual te
      // refieres?": la IA solo tiene que leer que cambio se pide. Ver migracion 032.
      //
      // Va ANTES que el atajo de deshacer: si no, responder a una actividad puntual con
      // "borrala" caia en deshacerUltima() -que solo conoce la ULTIMA creada en esta sesion,
      // no la que se identifico respondiendo- y borraba la equivocada (o ninguna).
      const isReply = !!(message.reply_to || message.metadata?.reply_preview)
      if (isReply) {
        // Responder al mensaje de confirmacion de un Proyecto: agrega una subtarea nueva a
        // ESE proyecto. Va antes que la rama de actividades: una respuesta asi nunca cita
        // una actividad, asi que no hay ambiguedad entre las dos.
        const repliedProyectoId = resolveRepliedProyectoId(message)
        if (repliedProyectoId && !ACUSE_RE.test(content) && !DESHACER_RE.test(content)) {
          try {
            const hermanas = (await minutesService.getByTeam(teamId, 'proyecto')).filter(
              (i) => i.parent_item_id === repliedProyectoId,
            )
            await minutesService.create({
              team_id: teamId,
              tipo: 'proyecto',
              orden: hermanas.length,
              tema: content,
              para_todos: false,
              responsables: [],
              responsables_text: '',
              estado: 'pendiente',
              plazo: null,
              comentarios: '',
              linked_activity_ids: [],
              created_by: message.sender_id,
              parent_item_id: repliedProyectoId,
            })
            await aiSay(`✅ Subtarea agregada: "${content}"`)
          } catch (err) {
            console.error('Subtarea de proyecto por respuesta fallo:', err)
            await aiSay('No pude agregar la subtarea (revisa tus permisos).')
          }
          setAiProcessing(false)
          return
        }
        const repliedActivityId = resolveRepliedActivityId(message)
        // "es un proyecto"/"creala como proyecto" respondiendo a la actividad recien creada:
        // convierte en vez de intentar "actualizarla" (que no tiene forma de cambiar el tipo
        // y termina respondiendo "no vi ningun cambio", caso real reportado).
        if (RECLASIFICAR_PROYECTO_RE.test(content) && repliedActivityId) {
          await solicitarReclasificarProyecto(repliedActivityId)
          setAiProcessing(false)
          return
        }
        if (RECLASIFICAR_INGESTA_RE.test(content) && repliedActivityId) {
          await solicitarReclasificarIngesta(repliedActivityId)
          setAiProcessing(false)
          return
        }
        if (RECLASIFICAR_ERROR_RE.test(content) && repliedActivityId) {
          await solicitarReclasificarError(repliedActivityId)
          setAiProcessing(false)
          return
        }
        if (DESHACER_RE.test(content) && repliedActivityId) {
          await solicitarEliminarActividad(repliedActivityId)
          setAiProcessing(false)
          return
        }
        // Con la actividad identificada no hay nada que adivinar. Sin ella, se busca entre
        // las abiertas o se pregunta cual es: lo que NO se hace nunca es crear una actividad
        // nueva con el texto de la instruccion.
        const handled =
          repliedActivityId &&
          (await applyTargetedUpdate(repliedActivityId, content, recentHistory(message.id)))
        // Si el modo dirigido no pudo (fallo la IA), se reintenta contra las abiertas antes
        // de rendirse. Aun asi nunca cae a creacion: es una respuesta.
        if (!handled) await runUpdateFlow(message, content, true)
        setAiProcessing(false)
        return
      }

      // DESHACER (fuera de una respuesta): deshace lo ULTIMO creado en esta sesion, rapido y
      // sin preguntar. Va antes de clasificar: si no, "borrala" se leeria como una actividad
      // nueva titulada "borrala", que es exactamente el tipo de basura que esto viene a limpiar.
      if (DESHACER_RE.test(content)) {
        await deshacerUltima()
        setAiProcessing(false)
        return
      }

      // MINUTA / PROYECTO: tipo forzado desde el selector, O "agrega/crea un proyecto..."
      // detectado en Auto -> crea un tema en esa hoja del equipo (mismo mecanismo, solo
      // cambia el valor de `tipo`: son la misma tabla con listas separadas, igual que ya
      // distingue 'ingesta'). Se pasa por el clasificador para extraer tema, responsable y
      // plazo del texto libre, igual que una actividad: si nombran a alguien, el tema queda
      // asignado a esa persona.
      const proyectoAuto = isAutoMode && teamId && PROYECTO_RE.test(content)
      // Documento de minuta ya estructurado (varias viñetas) pegado en modo Auto: caso real
      // reportado por Sebastian -sin esto, caía derecho al camino de "actividad" (el
      // clasificador de Auto no tiene forma de saber que un acta completa no es una tarea
      // suelta) ANTES de llegar siquiera a este bloque. Mismo umbral que la deteccion de abajo.
      const minutaEstructuradaAuto =
        isAutoMode &&
        teamId &&
        !proyectoAuto &&
        contarVinetas(content) >= MINUTA_ESTRUCTURADA_MIN_VINETAS
      if (
        forcedType === 'minuta' ||
        forcedType === 'proyecto' ||
        proyectoAuto ||
        minutaEstructuradaAuto
      ) {
        const tipoHoja: HojaTipo = forcedType === 'proyecto' || proyectoAuto ? 'proyecto' : 'minuta'

        // Minuta ya estructurada (varias viñetas): se separa en un tema por viñeta en vez de
        // aplastar todo el documento en uno solo. Sin subtareas ni agrupar por sección -cada
        // viñeta queda como su propio tema suelto, a pedido de Sebastian (mas simple: se asigna
        // despues, uno por uno, si hace falta). Reusa el mismo parseo que el modo "masivo" de
        // actividades (`classifyBulk`/ai-bulk): un item por viñeta detectada, title/description
        // separados. Si algo falla, cae al camino normal de un solo tema (mas abajo).
        if (contarVinetas(content) >= MINUTA_ESTRUCTURADA_MIN_VINETAS) {
          try {
            const membersBulk = await ensureMembers()
            const { activities: items } = await classifyBulk(
              content,
              membersBulk.map((m) => m.full_name),
            )
            if (items.length >= 2) {
              const existing = await minutesService.getByTeam(teamId, tipoHoja)
              let orden = existing.length
              let creados = 0
              for (const item of items) {
                try {
                  await minutesService.create({
                    team_id: teamId,
                    tipo: tipoHoja,
                    orden: orden++,
                    tema: item.title,
                    para_todos: false,
                    responsables: [],
                    responsables_text: '',
                    estado: 'pendiente',
                    plazo: item.due_date,
                    comentarios:
                      item.description && item.description !== item.title ? item.description : '',
                    linked_activity_ids: [],
                    created_by: message.sender_id,
                  })
                  creados++
                } catch (err) {
                  console.error('Item de minuta estructurada fallo:', err)
                }
              }
              await aiSay(
                `✅ Detecte una minuta con varios puntos y la separe: ${creados} tema${creados === 1 ? '' : 's'} agregado${creados === 1 ? '' : 's'} a ${tipoHoja === 'proyecto' ? 'Proyectos' : 'la minuta'}.`,
              )
              setMessages((prev) =>
                prev.map((m) => (m.id === message.id ? { ...m, category: null } : m)),
              )
              setAiProcessing(false)
              return
            }
          } catch (err) {
            console.error(
              'Parseo de minuta estructurada fallo, cae al camino normal de un solo tema:',
              err,
            )
          }
        }

        const members = await ensureMembers()
        let tema = content
        let hints: string[] = []
        let plazo: string | null = null
        try {
          const parsed = await classifyMessage(
            content,
            members.map((m) => m.full_name),
          )
          // El titulo de la IA sirve para minuta (esta entrenada para eso), pero para
          // proyecto devuelve frases estilo "Agregar proyecto y revisar X" en vez del
          // nombre limpio -por eso se pisa con el parseo dedicado abajo-.
          tema = parsed.entities.title || content
          hints = parsed.entities.responsibles?.length
            ? parsed.entities.responsibles
            : parsed.entities.responsible
              ? [parsed.entities.responsible]
              : []
          plazo = parsed.entities.due_date
        } catch (err) {
          // Si la IA falla, el tema se crea igual con el texto tal cual.
          console.error('Minuta classify failed:', err)
        }

        // Nombre del proyecto y su primer punto (si vino en el mismo mensaje), separados
        // del texto crudo -no del titulo de la IA-, que es justo lo que no sirve aca.
        let primerPunto: string | null = null
        if (tipoHoja === 'proyecto') {
          const parsedProyecto = parseProyectoIntent(content)
          tema = parsedProyecto.nombre
          primerPunto = parsedProyecto.primerPunto
        }

        const topic: PendingMinuta = { tema, comentarios: content, plazo }

        if (hints.length && canAssignMinuta) {
          // Cada nombre se resuelve por separado: "Genaro y Javier" son dos personas, no
          // una a desambiguar entre dos candidatos.
          const resolved: { id: string; name: string }[] = []
          let pendiente: { hint: string; matches: Member[] } | null = null
          for (const hint of hints) {
            const matches = matchMembers(hint, members)
            if (matches.length === 1 && !resolved.some((r) => r.id === matches[0].id)) {
              resolved.push({ id: matches[0].id, name: matches[0].full_name })
            } else if (matches.length !== 1) {
              pendiente = { hint, matches }
              break
            }
          }

          if (!pendiente) {
            await createMinutaTopic(
              topic,
              resolved,
              message.sender_id,
              undefined,
              tipoHoja,
              primerPunto,
            )
          } else {
            // El nombre que no se pudo resolver se pregunta; los que ya calzaron viajan en
            // metadata para no perderlos cuando el usuario responda la pregunta.
            const candidates = (pendiente.matches.length ? pendiente.matches : members).map(
              (m) => ({ id: m.id, name: m.full_name }),
            )
            await appendAndSave({
              id: `ai-minutaconfirm-${Date.now()}`,
              content:
                pendiente.matches.length === 0
                  ? `No encontre a "${pendiente.hint}" en el equipo. ¿A quien asigno el tema "${tema}"?`
                  : `Hay varias personas que coinciden con "${pendiente.hint}". ¿A quien asigno el tema "${tema}"?`,
              sender_id: 'ai',
              category: null,
              created_at: new Date().toISOString(),
              team_id: teamId,
              sender: { full_name: 'Lumix', avatar_url: null },
              metadata: {
                type: 'name_confirm',
                candidates,
                minuta: topic,
                otherResponsables: resolved,
                tipoMinuta: tipoHoja,
                primerPunto,
              },
            })
          }
        } else {
          if (hints.length && !canAssignMinuta) {
            await aiSay(
              `No puedes asignar temas de minuta a otras personas, asi que "${tema}" queda sin responsable.`,
            )
          }
          await createMinutaTopic(topic, [], message.sender_id, undefined, tipoHoja, primerPunto)
        }

        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, category: null } : m)))
        setAiProcessing(false)
        return
      }

      // PREGUNTAS: detectar con prefijo ? o palabras interrogativas
      //
      // "ver " suelto NO cuenta: en español "ver X" tambien es una tarea ("ver pedido de
      // produccion con el SME" = revisarlo, no preguntar por el). Caso real: eso se
      // clasificaba como pregunta, Lumix contestaba "no encontre nada" en vez de crear la
      // actividad. wantsEditList/wantsQuestionList ya cubren "ver" + palabra de tarea
      // (activ/tarea/pendient/labor) por su cuenta, asi que no se pierde ese caso.
      // "hay " normalmente es pregunta ("hay actividades pendientes?"), pero "hay QUE" es una
      // orden en espanol ("hay que ordenar la bodega" = alguien debe hacerlo), no una consulta.
      // Sin el lookahead, esa frase se contestaba como pregunta y nunca se creaba nada
      // (caso real reportado).
      const questionWords =
        /^(que |como |cual |cuantas |cuantos |quien |donde |cuando |dame |dime |entregame |cuentame |resume |listame |muestrame |consultame |hay (?!que\b)|mostrame |quiero ver|mis |cuales son)\b/i
      const isQuestion = /^[?¿/]/.test(content) || questionWords.test(content)

      // LISTADO EDITABLE: "cambiar/ver/modificar las de <persona/equipo>" (aunque no sea pregunta)
      if (isAutoMode && teamId && wantsEditList(content)) {
        await showActivityList(content, message.sender_id)
        setAiProcessing(false)
        return
      }

      if (isQuestion && teamId) {
        // Preguntas de listado => tabla editable en vez de texto
        if (wantsQuestionList(content)) {
          await showActivityList(content, message.sender_id)
          setAiProcessing(false)
          return
        }

        const teamData = await buildTeamData(message.sender_id)

        try {
          const answer = await askQuestion(content, teamData, recentHistory(message.id))
          await aiSay(answer)
        } catch (err) {
          console.error('AI question failed:', err)
          await aiSay('No pude responder tu consulta en este momento. Intentalo de nuevo.')
        }
        setAiProcessing(false)
        return
      }

      // ACTUALIZACION: si el mensaje suena a editar una actividad existente (solo en Auto),
      // consultamos a la IA de update. Si no aplica, cae a creacion normal.
      if (isAutoMode && teamId && UPDATE_VERBS.test(content)) {
        if (await runUpdateFlow(message, content, false)) {
          setAiProcessing(false)
          return
        }
      }

      // CLASIFICACION
      const members = await ensureMembers()
      const memberNames = members.map((m) => m.full_name)

      let result: ClassifyResult
      try {
        result = await classifyMessage(content, memberNames, recentHistory(message.id))
      } catch (err) {
        console.error('AI classification failed:', err)
        await aiSay('No pude procesar tu mensaje ahora. Intentalo de nuevo en unos segundos.')
        setAiProcessing(false)
        return
      }

      if (!result?.category) {
        await aiSay('No pude interpretar tu mensaje. Intenta reformularlo.')
        setAiProcessing(false)
        return
      }

      // Tipo forzado desde el selector del chat (actividad/error/ingesta)
      if (forcedType && forcedType !== 'auto') {
        result = { ...result, category: forcedType as ClassifyResult['category'] }
      }

      const category = result.category
      const dueDate = result.entities.due_date || defaultDueDate()
      const priority = result.entities.priority ?? 2
      const title = result.entities.title || content.slice(0, 100)

      // Telemetria: que entendio la IA. Nunca lanza; si falla, el chat sigue igual.
      const decisionId = await aiDecisionsService.log({
        teamId,
        userId: message.sender_id,
        messageId: message.id,
        sourceText: content,
        model: result.model ?? null,
        predictedCategory: result.category,
        predictedDepth: result.depth ?? null,
        confidence: result.confidence ?? null,
        predictedEntities: result.entities,
      })

      // CONSULTA: el mensaje no crea nada. Es continuacion de una pregunta anterior ("y para
      // la proxima") o un acuse ("ok", "gracias"). Solo lo detecta la IA cuando recibe el
      // hilo de contexto; antes cualquiera de esos se volvia una actividad con ese titulo.
      //
      // Solo se acepta si HAY hilo previo que continuar. Medido con mensajes reales: sin
      // hilo, el modelo llega a marcar como consulta cosas como "agregar actividad para
      // genaro", y ahi el costo del error es alto: consulta = no se crea nada, asi que la
      // actividad se pierde en silencio. Una actividad de mas se ve y se borra; una que
      // nunca existio, no. Ante la duda, se crea.
      if (category === 'consulta' && recentHistory(message.id).length > 0) {
        // Se detecta el ACUSE, no la pregunta: "y para la proxima" no lleva signo ni empieza
        // con palabra interrogativa, y es justamente el caso que hay que responder.
        //
        // Acuse => se avisa que no se creo nada, en vez de quedarse mudo: si la IA se
        // equivoco al llamarlo consulta, el usuario lo ve al toque. Un silencio se confunde
        // con "quedo listo". Todo lo demas se trata como pregunta encadenada.
        if (teamId && !ACUSE_RE.test(content)) {
          try {
            await aiSay(
              await askQuestion(
                content,
                await buildTeamData(message.sender_id),
                recentHistory(message.id),
              ),
            )
          } catch (err) {
            console.error('AI question failed:', err)
            await aiSay('No pude responder tu consulta en este momento.')
          }
        } else {
          await aiSay('Anotado. No cree ninguna actividad con esto.')
        }
        // Sin categoria: no crea nada, asi que no se marca como actividad ni error.
        setAiProcessing(false)
        return
      }

      // Primer filtro: si el texto menciona la palabra "error" o "ingesta", en modo Auto
      // siempre preguntamos que tipo es (actividad / error / ingesta). Si el usuario ya eligio
      // el tipo con el selector del chat, forcedType != 'auto' y no entra aca (es explicito).
      const mentionsError = MENTIONS_ERROR.test(content)
      const mentionsIngesta = MENTIONS_INGESTA.test(content)
      // "primer punto"/"varios pasos"/etc sin la frase explicita "crea un proyecto" (esa ya
      // se resolvio sola, mas arriba): es ambiguo de verdad, asi que se pregunta en vez de
      // crear una actividad suelta y perder que en realidad eran varios pasos relacionados.
      const mentionsProyecto = MENTIONS_PROYECTO_SUAVE.test(content)

      // La IA devuelve cuanta confianza tiene y el prompt le pide bajar de 0.6 cuando duda.
      // Ese dato se guardaba para telemetria y NO cambiaba nada: en 8 de 67 clasificaciones
      // el modelo dijo "no estoy seguro" y la actividad se creo igual, a ciegas.
      //
      // Ahora, si duda, se pregunta. Es el mismo popout que ya existe para cuando el texto
      // menciona "error" o "ingesta"; solo cambia el motivo por el que se abre.
      const dudaDelModelo = typeof result.confidence === 'number' && result.confidence < 0.6

      if (isAutoMode && (mentionsError || mentionsIngesta || mentionsProyecto || dudaDelModelo)) {
        const options: ('error' | 'ingesta' | 'proyecto')[] = []
        if (mentionsError) options.push('error')
        if (mentionsIngesta) options.push('ingesta')
        if (mentionsProyecto) options.push('proyecto')
        // Si se abre por duda y no hay NINGUNA pista en el texto (ni error, ni ingesta, ni
        // proyecto), se ofrecen error+ingesta como antes: el modelo no supo, y esas dos
        // siguen siendo la ambiguedad clasica. Si ya se detecto proyecto, no hace falta
        // inventar mas alternativas encima.
        if (!options.length) options.push('error', 'ingesta')
        const pending: PendingCategory = {
          content,
          title,
          priority,
          dueDate,
          severity: (result.entities.severity as string) ?? null,
          responsibleHint: result.entities.responsible ?? null,
          senderId: message.sender_id,
          options,
          sourceMessageId: message.id,
          decisionId,
          predictedCategory: result.category,
        }
        const optLabel = options
          .map((o) =>
            o === 'ingesta'
              ? 'una ingesta de datos'
              : o === 'proyecto'
                ? 'un proyecto (con subtareas)'
                : 'un error',
          )
          .join(' o ')
        // Se dice POR QUE se pregunta. "No estoy seguro" es informacion util: le avisa a la
        // persona que conviene mirar, en vez de parecer una pregunta caprichosa.
        const preambulo =
          dudaDelModelo && !mentionsError && !mentionsIngesta && !mentionsProyecto
            ? 'No estoy seguro. '
            : ''
        await appendAndSave({
          id: `ai-catconfirm-${Date.now()}`,
          content: `${preambulo}¿"${title}" es una actividad o ${optLabel}?`,
          sender_id: 'ai',
          category: null,
          created_at: new Date().toISOString(),
          team_id: teamId,
          sender: { full_name: 'Lumix', avatar_url: null },
          metadata: { type: 'category_confirm', pending },
        })
        return
      }

      // ERROR
      if (category === 'error') {
        await createErrorFromMessage({
          content,
          title,
          severity: (result.entities.severity as string) || 'media',
          senderId: message.sender_id,
          sourceMessageId: message.id,
          decisionId,
        })
        return
      }

      // ACTIVIDAD / INGESTA
      const actCategory: 'actividad' | 'ingesta' = category === 'ingesta' ? 'ingesta' : 'actividad'
      await createActivityOrIngesta({
        content,
        title,
        actCategory,
        priority,
        dueDate,
        senderId: message.sender_id,
        responsibleHint: result.entities.responsible,
        sourceMessageId: message.id,
        decisionId,
      })
    } catch (err) {
      console.error('AI processing failed:', err)
      await aiSay('Ocurrio un problema al procesar tu mensaje. Intentalo de nuevo.')
    } finally {
      setAiProcessing(false)
    }
  }

  // Modo Masivo: parsea el texto y devuelve las actividades detectadas (sin crear aun)
  const parseBulk = async (content: string): Promise<BulkActivity[]> => {
    const members = await ensureMembers()
    const result = await classifyBulk(
      content,
      members.map((m) => m.full_name),
    )
    return result.activities
  }

  return {
    messages,
    loading,
    sending,
    aiProcessing,
    sendMessage,
    classifyAndAct,
    parseBulk,
    bulkCreate,
    createResolvedActivity,
    createOverloadActivity,
    moverLoteSobrecarga,
    dejarLoteSobrecarga,
    // Para que "Cancelar (no crear)" deje registrada la decision en vez de solo cerrar.
    descartarAlerta: (messageId: string) => resolveInteractive(messageId, 'Se decidio no crearla'),
    createMinutaTopic,
    reassignResolved,
    confirmCategory,
    quickUpdate,
    bulkQuickUpdate,
    applyPendingUpdate,
    editActivityFields,
    listMembers,
    confirmarEliminarActividad,
    // Si no quiere borrar, la pregunta queda resuelta igual que las demas, sin quedar colgada.
    descartarEliminar: (messageId: string) => resolveInteractive(messageId, 'No se elimino'),
    confirmarReclasificarProyecto,
    descartarReclasificar: (messageId: string) =>
      resolveInteractive(messageId, 'Se dejo como actividad'),
    confirmarReclasificarIngesta,
    descartarReclasificarIngesta: (messageId: string) =>
      resolveInteractive(messageId, 'Se dejo como actividad'),
    confirmarReclasificarError,
    descartarReclasificarError: (messageId: string) =>
      resolveInteractive(messageId, 'Se dejo como actividad'),
    // name_confirm y activity_pick: su "Cancelar" solo cerraba el modal en pantalla sin marcar
    // nada en la base (a diferencia de las demas preguntas). Quedaban "pendientes" para
    // siempre aunque la persona ya dijo que no le interesaba -caso real: alguien cancela y se
    // va, y quien vuelve a mirar el chat la ve como si nunca se hubiera resuelto-.
    descartarNombre: (messageId: string) => resolveInteractive(messageId, 'No se eligio'),
    descartarActividadElegida: (messageId: string) => resolveInteractive(messageId, 'No se eligio'),
  }
}
