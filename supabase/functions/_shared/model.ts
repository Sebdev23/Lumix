// Eleccion del modelo y armado de parametros, compartido por las Edge Functions de IA.
//
// POR QUE EXISTE ESTE ARCHIVO
//
// Los parametros de la API de OpenAI dejaron de ser los mismos para todos los modelos. Las
// familias con razonamiento (gpt-5, o1, o3...) rechazan lo que el resto acepta. Verificado
// contra la API el 11-08-2026:
//
//   gpt-5-mini + max_tokens        -> 400 "use 'max_completion_tokens' instead"
//   gpt-5-mini + temperature: 0.1  -> 400 "only the default (1) value is supported"
//   gpt-4.1-mini                   -> acepta ambos
//
// Es decir: cambiar AI_MODEL a un modelo de razonamiento sin tocar el codigo dejaba las
// cinco funciones devolviendo 400. Aca se decide una sola vez y no en cada funcion.
//
// SOBRE ELEGIR MODELO
//
// Medido con el prompt real de clasificacion y los casos que fallaron en uso real:
//
//   gpt-4o        6/6 aciertos   1.7s   US$0.00607 por llamada
//   gpt-5-mini    3/6 aciertos  15.5s   US$0.00259   <- quema 768-1200 tokens razonando y
//                                                        dos veces devolvio texto vacio
//   gpt-4.1-mini  6/6 aciertos   2.1s   US$0.00097   <- el elegido
//
// Ojo con los modelos de razonamiento en tareas de extraccion: los tokens de razonamiento
// salen del presupuesto de salida, asi que un max bajo se traduce en respuesta VACIA, no en
// respuesta corta. Si algun dia se usa uno, hay que subir bastante el limite.

/** Modelos cuyos tokens de razonamiento salen del presupuesto de salida. */
function esModeloDeRazonamiento(model: string): boolean {
  return /^(gpt-5|o\d)/i.test(model)
}

/**
 * Modelo a usar por esta funcion.
 *
 * Permite afinar por funcion sin tocar codigo: AI_MODEL_CLASSIFY, AI_MODEL_UPDATE, etc.
 * Si no esta definida, cae a AI_MODEL, y si tampoco, al default. Los trabajos son
 * distintos —clasificar no es lo mismo que redactar una minuta— y antes una sola variable
 * obligaba a mover las cinco funciones juntas.
 */
export function pickModel(fn: string, fallback = 'gpt-4.1-mini'): string {
  const especifica = Deno.env.get(`AI_MODEL_${fn.toUpperCase()}`)
  return especifica || Deno.env.get('AI_MODEL') || fallback
}

/**
 * Formato de respuesta con esquema estricto.
 *
 * Con `json_object` el modelo devuelve JSON valido pero no necesariamente el JSON que se le
 * pidio: podia faltar un campo, sobrar otro o venir un valor fuera del catalogo, y eso solo
 * se descubria mas abajo, con un undefined en la UI. Con `json_schema` + strict la API
 * garantiza la forma exacta.
 *
 * Reglas del modo strict, verificadas contra la API el 11-08-2026:
 *   * todo objeto necesita additionalProperties: false
 *   * TODAS las propiedades van en `required`; lo opcional se modela como nullable
 *     (type: ['string','null']), no dejandolo fuera de required
 *   * `name` solo acepta [a-zA-Z0-9_-]: un espacio o un parentesis da 400
 *   * no se admiten minimum/maximum/format
 *
 * Aparece ademas un caso nuevo que con json_object no existia: el modelo puede responder
 * `refusal` en vez de `content`. Quien llame tiene que contemplarlo.
 */
export function jsonSchemaFormat(name: string, schema: Record<string, unknown>) {
  return { type: 'json_schema', json_schema: { name, strict: true, schema } }
}

/**
 * Parametros de generacion validos para el modelo dado.
 *
 * @param maxOut  tokens de salida que la funcion necesita para su respuesta util.
 * @param temperature  se omite en los modelos que solo aceptan el default.
 */
export function tuningParams(
  model: string,
  maxOut: number,
  temperature?: number,
): Record<string, unknown> {
  if (esModeloDeRazonamiento(model)) {
    // El razonamiento se paga del mismo presupuesto: se deja margen para que quede algo
    // para la respuesta. Sin esto la llamada devuelve contenido vacio.
    return { max_completion_tokens: maxOut + 1500 }
  }
  return { max_tokens: maxOut, ...(temperature === undefined ? {} : { temperature }) }
}
