-- Migration 031: los mensajes interactivos de Lumix sobreviven a la recarga.
--
-- Lumix responde con mensajes que no son solo texto: la alerta de sobrecarga, la pregunta
-- de "a quien se lo asigno", la de categoria ambigua y el selector de actividad. Todos
-- llevan un objeto `metadata` con el tipo y la accion que quedo pendiente (por ejemplo, la
-- actividad que TODAVIA no se creo y espera que el usuario elija fecha).
--
-- La tabla no tenia donde guardar ese objeto, asi que el cliente los agregaba con
-- appendAndSave(..., persist = false): vivian solo en el estado de React. Sintoma que se
-- vio en uso real: la alerta de sobrecarga aparecia, se veia bien, y al recargar el chat
-- el mensaje no estaba. Nunca se habia enviado.
--
-- Con esta columna el mensaje se guarda completo y al recargar se rehidrata clickeable.
--
-- Se califica el esquema a proposito: existe tambien realtime.messages y un ALTER sin
-- calificar depende del search_path de quien lo ejecute.
--
-- No destructivo: columna nueva, nullable, sin default. Las 470 filas existentes quedan en
-- metadata NULL y se renderizan como hasta ahora (burbuja de texto plano).
-- Las politicas RLS no cambian: metadata queda cubierta por messages_select/messages_insert.

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS metadata jsonb;

COMMENT ON COLUMN public.messages.metadata IS
  'Payload de los mensajes interactivos de Lumix: { type, pending, candidates, ... }. NULL en mensajes de texto normales.';

-- Marcar una alerta como resuelta.
--
-- Cuando el usuario decide (crea la actividad, elige responsable, elige categoria) la alerta
-- tiene que dejar de ser clickeable: si no, al recargar podria tocarla de nuevo y crear la
-- misma actividad dos veces. Hasta ahora eso se resolvia borrando el mensaje del estado de
-- React, lo que alcanzaba justamente porque nunca se habia guardado.
--
-- No se abre una politica UPDATE sobre messages: eso dejaria a cualquiera reescribir el
-- content de sus propios mensajes, y la 028 acaba de cerrar el acceso a esta tabla. En vez
-- de eso, esta funcion es la unica via de escritura y solo puede tocar metadata, solo en
-- mensajes propios. El texto de la resolucion se arma aca adentro, asi que el cliente
-- tampoco puede inyectar claves arbitrarias en el objeto.

CREATE OR REPLACE FUNCTION public.resolver_mensaje_interactivo(
  p_message_id uuid,
  p_resolucion text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messages
     SET metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('resolved', true, 'resolution', p_resolucion)
   WHERE id = p_message_id
     AND sender_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mensaje no encontrado o no te pertenece';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolver_mensaje_interactivo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_mensaje_interactivo(uuid, text) TO authenticated;
