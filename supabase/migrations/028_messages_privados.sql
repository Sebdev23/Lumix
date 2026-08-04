-- Migration 028: el chat privado deja de depender del JavaScript.
--
-- En Lumix cada persona ve SOLO su propia conversacion con Lumix (las respuestas de la IA
-- se guardan con el sender_id de quien pregunto). El admin global ve todo el hilo del equipo.
--
-- Ese "solo lo mio" estaba implementado unicamente en el cliente:
--   useChatMessages: data.filter(m => m.sender_id === user.id)
-- pero la politica solo preguntaba si eras miembro del equipo, nunca de quien era el mensaje.
-- Resultado verificado con una sesion real: un colaborador podia leer por REST los mensajes
-- privados de sus companeros. Bastaba abrir la pestana Red del navegador.
--
-- Ahora la base garantiza lo mismo que la UI:
--   * cada quien lee sus propios mensajes
--   * el admin global sigue leyendo todo, pero solo de los equipos donde es miembro
--     (misma cobertura que hoy: no se le amplia el alcance a equipos ajenos)
--
-- No cambia messages_insert: seguir siendo miembro del equipo es requisito para escribir.

DROP POLICY IF EXISTS messages_select ON messages;

CREATE POLICY messages_select ON messages
  FOR SELECT
  USING (
    sender_id = auth.uid()
    OR (
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      )
      AND EXISTS (
        SELECT 1 FROM team_members
        WHERE team_members.team_id = messages.team_id
          AND team_members.user_id = auth.uid()
      )
    )
  );
