-- OPERA AI - Seed Data for Development

-- Insert test team
INSERT INTO teams (id, name, description, created_by)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Equipo de Desarrollo',
  'Equipo principal de desarrollo de OPERA AI',
  '00000000-0000-0000-0000-000000000010'
);

-- Note: profiles are auto-created by the handle_new_user() trigger on signup.
-- For local dev, seed some test activities and errors directly:

-- Seed test activities
INSERT INTO activities (title, description, responsible_id, priority, status, due_date, team_id, created_by) VALUES
('Actualizar integracion Supabase', 'Migrar a la nueva version del cliente', NULL, 3, 'pendiente', '2026-06-25', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010'),
('Corregir bug de autenticacion', 'Error en produccion con el refresh token', NULL, 5, 'en_proceso', '2026-06-21', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010'),
('Disenar pantalla de onboarding', 'Crear tutorial interactivo', NULL, 2, 'pendiente', '2026-06-28', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010');

-- Seed test errors
INSERT INTO errors (title, description, severity, status, team_id, created_by) VALUES
('No funciona login con Google', 'El redirect URI no esta configurado correctamente', 'alta', 'abierto', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010'),
('Timeout en Edge Function', 'La funcion de IA excede los 30 segundos', 'critica', 'en_revision', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010');

-- Seed test meeting
INSERT INTO meetings (title, scheduled_at, created_by, team_id) VALUES
('Planning Sprint 2', '2026-06-22 10:00:00-03', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001');
