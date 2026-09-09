-- Migration 045: estado propio para la Hoja de Ingesta (reformulacion pedida por Sebastian).
--
-- La Ingesta deja de compartir el enum de estado de Minuta/Proyecto (pendiente/en_desarrollo/
-- resuelto/definir, pensado para "se conversa en la reunion / se asigna / se resuelve") y pasa
-- a tener el suyo propio, mas parecido a una bitacora de solicitudes a otro equipo:
--   no_iniciado / en_proceso / completado / no_resuelto / cancelado
-- (se descarto un sexto valor "cerrado": Sebastian confirmo que seria redundante con
-- "completado" y prefiere no usarlo).
--
-- Va en una COLUMNA NUEVA (no se reusa `estado`) para no mezclar dos vocabularios distintos
-- en la misma columna: Minuta/Proyecto siguen usando `estado` exactamente igual que siempre,
-- Ingesta usa `estado_ingesta` y listo. Nullable porque solo aplica a tipo='ingesta'.
--
-- El "responsable" de una solicitud de Ingesta puede ser de OTRO equipo (o externo del todo),
-- asi que no encaja en `responsables` (ids de team_members del equipo activo). Se resuelve
-- SIN migracion: `responsables_text` ya existe en la tabla (pensado originalmente como
-- fallback de texto libre) y es exactamente lo que hace falta aca -Ingesta lo usa como su
-- campo principal de responsable, en vez de "Sin asignar" hasta que se resuelva de verdad-.

ALTER TABLE minute_items
  ADD COLUMN IF NOT EXISTS estado_ingesta TEXT
  CHECK (estado_ingesta IS NULL OR estado_ingesta IN ('no_iniciado', 'en_proceso', 'completado', 'no_resuelto', 'cancelado'));
