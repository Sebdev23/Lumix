-- Migration 037: deshacer una actividad recien creada desde el chat.
--
-- POR QUE UNA FUNCION Y NO UNA POLITICA DE DELETE
--
-- Hoy la app NO borra actividades nunca: no existe politica de DELETE sobre activities, asi
-- que la base las rechaza todas. Eso es deliberado y conviene mantenerlo: el trabajo
-- asignado no se borra, se completa o se reasigna.
--
-- Pero "deshaz eso" en el chat necesita justamente borrar. La respuesta NO es abrir el
-- DELETE para todos -eso convertiria una frase suelta en una herramienta de borrado general,
-- y ya vimos a la IA entender mal-. Es abrir una puerta estrecha, con cuatro condiciones que
-- se verifican en la base y no en el cliente:
--
--   1. la creo quien la esta deshaciendo
--   2. se creo hace menos de 30 minutos       -> es deshacer, no limpiar historial
--   3. sigue pendiente, nadie la empezo        -> si ya se trabajo en ella, no es basura
--   4. no tiene actividades hijas (delegacion) -> borrarla dejaria huerfanas
--
-- Si algo no calza, no borra y avisa por que. El chat traduce ese motivo a una frase.
--
-- Ademas limpia el vinculo en los temas de minuta: si no, el tema quedaria apuntando a una
-- actividad que ya no existe y su estado se calcularia mal.

CREATE OR REPLACE FUNCTION public.deshacer_actividad(p_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT * INTO a FROM activities WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN 'no_existe';
  END IF;

  IF a.created_by <> auth.uid() THEN
    RETURN 'no_es_tuya';
  END IF;

  IF a.created_at < now() - interval '30 minutes' THEN
    RETURN 'muy_antigua';
  END IF;

  IF a.status <> 'pendiente' THEN
    RETURN 'ya_empezada';
  END IF;

  IF EXISTS (SELECT 1 FROM activities h WHERE h.parent_activity_id = p_id) THEN
    RETURN 'tiene_delegadas';
  END IF;

  -- El tema de minuta no puede quedar apuntando a una actividad borrada.
  UPDATE minute_items
     SET linked_activity_ids = array_remove(linked_activity_ids, p_id)
   WHERE p_id = ANY(linked_activity_ids);

  -- La telemetria pierde el vinculo, no la fila: sirve saber que se predijo y se deshizo.
  UPDATE ai_decisions SET entity_id = NULL WHERE entity_id = p_id;

  DELETE FROM notifications WHERE (metadata->>'activity_id')::uuid = p_id;
  DELETE FROM activities WHERE id = p_id;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.deshacer_actividad(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deshacer_actividad(uuid) TO authenticated;
