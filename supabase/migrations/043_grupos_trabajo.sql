-- Migration 043: "grupos de trabajo" (alias "foco") dentro de un equipo.
--
-- Feedback de usuarios (via Sebastian): un equipo puede tener distintos focos internos
-- (ej. "excelencia", "productividad", "entrenamiento") y a la jefatura le gustaria poder
-- FILTRAR por ese grupo en Minuta y Actividades. Alcance acotado a proposito (confirmado con
-- Sebastian): un FILTRO, no un agrupamiento visual nuevo en Compromisos -eso quedo descartado-.
--
-- "Foco" y "grupo de trabajo" son el mismo concepto (confirmado): la jefatura los crea y
-- asigna a sus colaboradores. Se modela como catalogo por equipo (no texto libre) para evitar
-- variantes tontas ("Productividad" vs "productividad") y porque se van a reusar seguido en
-- los selectores de filtro.

CREATE TABLE grupos_trabajo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, nombre)
);

-- Cada miembro pertenece a lo sumo un grupo por equipo (si mas adelante hace falta que
-- pertenezca a varios, se separa a una tabla puente; hoy el pedido es "agrupar personas",
-- no "etiquetar con multiples focos").
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS grupo_id UUID REFERENCES grupos_trabajo(id) ON DELETE SET NULL;

ALTER TABLE grupos_trabajo ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier miembro del equipo (necesita ver los grupos para el selector de filtro),
-- ademas de jefatura/admin. Reusa los helpers ya existentes (034/021), sin RLS nueva rara.
CREATE POLICY grupos_trabajo_select ON grupos_trabajo
  FOR SELECT USING (es_miembro_del_equipo(team_id) OR is_team_manager(team_id));

-- Escritura: solo jefatura/admin del equipo (mismo criterio que ya gobierna team_members).
CREATE POLICY grupos_trabajo_insert ON grupos_trabajo
  FOR INSERT WITH CHECK (is_team_manager(team_id));

CREATE POLICY grupos_trabajo_update ON grupos_trabajo
  FOR UPDATE USING (is_team_manager(team_id)) WITH CHECK (is_team_manager(team_id));

CREATE POLICY grupos_trabajo_delete ON grupos_trabajo
  FOR DELETE USING (is_team_manager(team_id));

-- Asignar/quitar el grupo de un miembro es un UPDATE de team_members (columna grupo_id):
-- ya gobernado por la policy team_members_update (migracion 021, is_team_manager), no hace
-- falta nada nuevo ahi.
