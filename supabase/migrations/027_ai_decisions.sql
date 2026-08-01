-- 027: registro de decisiones de la IA
--
-- Tabla NUEVA y puramente aditiva: no modifica ninguna tabla, columna,
-- politica ni fila existente. Si algo sale mal: DROP TABLE ai_decisions.
--
-- Para que sirve:
--   (a) medir la precision real del clasificador por categoria
--   (b) alimentar few-shot dinamico con los casos corregidos del equipo
--   (c) medir la proporcion trabajo profundo / superficial del equipo

CREATE TABLE IF NOT EXISTS "public"."ai_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" uuid NOT NULL REFERENCES "public"."teams"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "public"."profiles"("id") ON DELETE SET NULL,

  -- mensaje de origen. Sin FK a propositio: los mensajes se pueden purgar
  -- y no queremos perder el historial de aprendizaje por eso.
  "message_id" text,
  "source_text" text NOT NULL,

  -- lo que devolvio el modelo
  "model" text,
  "predicted_category" text,
  "predicted_depth" text,
  "confidence" numeric(3,2),
  "predicted_entities" jsonb,

  -- que quedo al final (solo se llena si el usuario corrigio)
  "final_category" text,
  "final_depth" text,
  "corrected" boolean NOT NULL DEFAULT false,
  "correction_source" text,

  -- a que fila termino apuntando
  "entity_table" text,
  "entity_id" uuid,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "corrected_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "ai_decisions_team_created_idx"
  ON "public"."ai_decisions" ("team_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "ai_decisions_corrected_idx"
  ON "public"."ai_decisions" ("team_id", "corrected");

ALTER TABLE "public"."ai_decisions" ENABLE ROW LEVEL SECURITY;

-- Mismo patron de RLS que activities/errors: solo miembros del equipo.
CREATE POLICY "ai_decisions_select" ON "public"."ai_decisions" FOR SELECT
  USING ((EXISTS ( SELECT 1
     FROM "public"."team_members"
    WHERE (("team_members"."team_id" = "ai_decisions"."team_id")
       AND ("team_members"."user_id" = "auth"."uid"())))));

CREATE POLICY "ai_decisions_insert" ON "public"."ai_decisions" FOR INSERT
  WITH CHECK ((EXISTS ( SELECT 1
     FROM "public"."team_members"
    WHERE (("team_members"."team_id" = "ai_decisions"."team_id")
       AND ("team_members"."user_id" = "auth"."uid"())))));

CREATE POLICY "ai_decisions_update" ON "public"."ai_decisions" FOR UPDATE
  USING ((EXISTS ( SELECT 1
     FROM "public"."team_members"
    WHERE (("team_members"."team_id" = "ai_decisions"."team_id")
       AND ("team_members"."user_id" = "auth"."uid"())))));
