-- Migration 034: la lectura de team_members deja de ser abierta.
--
-- QUE PASABA
--
-- La politica era `USING (auth.uid() IS NOT NULL)`: cualquier persona con cuenta podia leer
-- las 38 membresias de los 6 equipos, con sus roles y sus permisos, incluidos equipos a los
-- que no pertenece. Verificado con una sesion real: un colaborador de Equipo Prueba listaba
-- la organizacion completa y quien tiene permisos elevados.
--
-- No es escalacion -no puede cambiar nada- pero es informacion que no le corresponde, y
-- contradice el criterio de la 028, donde se cerro la lectura del chat por lo mismo.
--
-- QUE QUEDA
--
--   * cada quien lee SUS propias membresias, en cualquier equipo
--   * y las de los equipos donde es miembro (necesario para ver a sus companeros)
--   * el admin global y las jefaturas siguen leyendo su alcance de siempre
--
-- SOBRE LA RECURSION
--
-- La condicion natural seria "existe una fila de team_members que me pone en este equipo",
-- pero consultar team_members dentro de una politica SOBRE team_members se llama a si misma
-- sin fin. Por eso va en una funcion SECURITY DEFINER, que corre sin RLS: el mismo recurso
-- que ya usa is_team_manager desde la 030.

CREATE OR REPLACE FUNCTION public.es_miembro_del_equipo(t uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE team_id = t AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.es_miembro_del_equipo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_miembro_del_equipo(uuid) TO authenticated;

DROP POLICY IF EXISTS team_members_select ON public.team_members;
CREATE POLICY team_members_select ON public.team_members
  FOR SELECT USING (
    -- Mis propias membresias: necesario para resolver a que equipos pertenezco.
    user_id = auth.uid()
    -- Los equipos donde estoy: para ver a mis companeros y poder asignarles trabajo.
    OR es_miembro_del_equipo(team_id)
    -- Admin global y jefaturas del equipo, con el alcance que ya tenian.
    OR is_team_manager(team_id)
  );

-- INSERT, UPDATE y DELETE no cambian: siguen gobernados por is_team_manager.
