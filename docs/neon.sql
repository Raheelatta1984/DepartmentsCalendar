-- Orbit Neon pilot schema (also initialized automatically by the API).
-- Run only on the intended Neon database; no Supabase auth dependency.

CREATE TABLE IF NOT EXISTS public.orbit_workspace (
    id smallint PRIMARY KEY CHECK (id = 1),
    version integer NOT NULL CHECK (version > 0),
    state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS public.orbit_login_limits (
    key text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    attempts integer NOT NULL CHECK (attempts > 0)
  );
