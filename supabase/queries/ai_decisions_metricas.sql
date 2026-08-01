-- =====================================================================
-- Metricas de ai_decisions
--
-- Consultas de solo lectura para el SQL Editor de Supabase.
-- Todas filtran por equipo: cambia el team_id o comenta el WHERE.
--
-- Utiles a partir de ~2 semanas de uso. Antes de eso la muestra es
-- muy chica para concluir nada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PRECISION DEL CLASIFICADOR
-- La pregunta base: de cada 100 mensajes, cuantos entiende bien?
-- "corregidas" = el usuario eligio algo distinto en el popout.
-- ---------------------------------------------------------------------
SELECT
  count(*)                                                     AS total,
  count(*) FILTER (WHERE corrected)                            AS corregidas,
  round(100.0 * count(*) FILTER (WHERE NOT corrected)
        / nullif(count(*), 0), 1)                              AS acierto_pct,
  round(avg(confidence)::numeric, 2)                           AS confianza_media
FROM ai_decisions
WHERE created_at > now() - interval '30 days';


-- ---------------------------------------------------------------------
-- 2. PRECISION POR CATEGORIA
-- Donde falla mas? Sospecha inicial: la frontera actividad/ingesta.
-- ---------------------------------------------------------------------
SELECT
  predicted_category                                           AS predijo,
  count(*)                                                     AS veces,
  count(*) FILTER (WHERE corrected)                            AS corregidas,
  round(100.0 * count(*) FILTER (WHERE NOT corrected)
        / nullif(count(*), 0), 1)                              AS acierto_pct
FROM ai_decisions
WHERE created_at > now() - interval '30 days'
GROUP BY predicted_category
ORDER BY veces DESC;


-- ---------------------------------------------------------------------
-- 3. MATRIZ DE CONFUSION
-- Que confunde con que. Cada fila es un patron de error concreto:
-- si "ingesta -> actividad" domina, la regla del destino tecnico
-- en el prompt de ai-classify esta quedando corta.
-- ---------------------------------------------------------------------
SELECT
  predicted_category  AS predijo,
  final_category      AS era_en_realidad,
  count(*)            AS veces
FROM ai_decisions
WHERE corrected
GROUP BY predicted_category, final_category
ORDER BY veces DESC;


-- ---------------------------------------------------------------------
-- 4. CONFIANZA VS ACIERTO
-- La pregunta que decide cuanta autonomia se le puede dar a Lumix.
-- Si el tramo 0.9-1.0 acierta >95%, se puede automatizar sin preguntar
-- en ese tramo y reservar el popout para los tramos bajos.
-- Si el acierto es parecido en todos los tramos, el confidence no
-- sirve como dial y hay que seguir preguntando siempre.
-- ---------------------------------------------------------------------
SELECT
  width_bucket(confidence, 0, 1, 5)                            AS tramo,
  CASE width_bucket(confidence, 0, 1, 5)
    WHEN 1 THEN '0.0-0.2' WHEN 2 THEN '0.2-0.4' WHEN 3 THEN '0.4-0.6'
    WHEN 4 THEN '0.6-0.8' ELSE '0.8-1.0'
  END                                                          AS rango,
  count(*)                                                     AS veces,
  round(100.0 * count(*) FILTER (WHERE NOT corrected)
        / nullif(count(*), 0), 1)                              AS acierto_pct
FROM ai_decisions
WHERE confidence IS NOT NULL
GROUP BY 1, 2
ORDER BY 1;


-- ---------------------------------------------------------------------
-- 5. TRABAJO PROFUNDO VS SUPERFICIAL, POR SEMANA
-- El numero de Newport. Es el que va al dashboard.
-- ---------------------------------------------------------------------
SELECT
  date_trunc('week', created_at)::date                         AS semana,
  count(*)                                                     AS total,
  count(*) FILTER (WHERE coalesce(final_depth, predicted_depth) = 'profunda')     AS profundas,
  count(*) FILTER (WHERE coalesce(final_depth, predicted_depth) = 'superficial')  AS superficiales,
  round(100.0 * count(*) FILTER (WHERE coalesce(final_depth, predicted_depth) = 'superficial')
        / nullif(count(*) FILTER (WHERE coalesce(final_depth, predicted_depth) IS NOT NULL), 0), 1)
                                                               AS superficial_pct
FROM ai_decisions
GROUP BY 1
ORDER BY 1 DESC;


-- ---------------------------------------------------------------------
-- 6. PROFUNDIDAD POR PERSONA
-- Quien esta ahogado en trabajo superficial. Es la conversacion que
-- una jefatura no puede tener hoy porque no tiene el dato.
-- ---------------------------------------------------------------------
SELECT
  p.full_name                                                  AS persona,
  count(*)                                                     AS total,
  count(*) FILTER (WHERE coalesce(d.final_depth, d.predicted_depth) = 'profunda')  AS profundas,
  round(100.0 * count(*) FILTER (WHERE coalesce(d.final_depth, d.predicted_depth) = 'superficial')
        / nullif(count(*), 0), 1)                              AS superficial_pct
FROM ai_decisions d
JOIN profiles p ON p.id = d.user_id
WHERE d.created_at > now() - interval '30 days'
GROUP BY p.full_name
ORDER BY superficial_pct DESC NULLS LAST;


-- ---------------------------------------------------------------------
-- 7. MATERIA PRIMA PARA FEW-SHOT DINAMICO
-- Los casos donde la IA se equivoco y el humano la corrigio.
-- Estos son los ejemplos que se le inyectan al prompt de ai-classify
-- para que no repita el mismo error. Es el paso siguiente del plan.
-- ---------------------------------------------------------------------
SELECT
  source_text                                                  AS mensaje,
  predicted_category                                           AS predijo,
  final_category                                               AS correcto,
  confidence,
  corrected_at
FROM ai_decisions
WHERE corrected
ORDER BY corrected_at DESC
LIMIT 30;
