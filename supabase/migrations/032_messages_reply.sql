-- Migration 032: responder a un mensaje (como WhatsApp).
--
-- Para que sirve, mas alla de la burbuja citada: hoy, cuando alguien escribe "muevela al
-- viernes", ai-update recibe la lista de actividades abiertas y tiene que adivinar cual es
-- (targetIndex). Cuando no puede, la app abre el popout activity_pick a preguntar.
--
-- Si el mensaje viene respondiendo a otro, el objetivo ya no se adivina: se sabe. Eso
-- elimina la ambiguedad, saca la lista del prompt y hace innecesario el popout en ese caso.
--
-- Dos piezas:
--   * reply_to: a que mensaje responde. Con FK, para poder saltar al original al tocarlo.
--     ON DELETE SET NULL y no CASCADE: borrar un mensaje no puede llevarse las respuestas.
--   * vincular_mensaje_actividad: deja el activity_id en la metadata del mensaje que
--     ORIGINO una actividad. Sin esto solo se puede responder a las tarjetas de Lumix; con
--     esto tambien se puede responder al mensaje propio ("manana reunion con Pedro") y que
--     la app sepa de que actividad se trata.
--
-- No destructivo: columna nueva nullable. Las filas existentes quedan en NULL y se
-- renderizan como hasta ahora. Las politicas RLS no cambian.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to uuid REFERENCES public.messages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.messages.reply_to IS
  'Mensaje al que responde este, si es una respuesta citada. NULL en mensajes normales.';

-- Buscar las respuestas de un mensaje (y validar la FK al borrar) sin recorrer la tabla.
CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON public.messages(reply_to) WHERE reply_to IS NOT NULL;

-- Vincula un mensaje con la actividad que genero.
--
-- Misma decision que en la 031: no se abre una politica UPDATE sobre messages. Esta funcion
-- solo escribe activity_id, solo en mensajes propios, y solo si todavia no tiene uno: asi un
-- mensaje no puede quedar apuntando a una actividad distinta despues.

CREATE OR REPLACE FUNCTION public.vincular_mensaje_actividad(
  p_message_id uuid,
  p_activity_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.messages
     SET metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('activity_id', p_activity_id)
   WHERE id = p_message_id
     AND sender_id = auth.uid()
     AND (metadata->>'activity_id') IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_mensaje_actividad(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vincular_mensaje_actividad(uuid, uuid) TO authenticated;
