-- Orbit's Neon PostgreSQL schema.
-- The API runs these idempotent migrations automatically on first use. This
-- file is also safe to run manually as the owner of the target Neon database.
-- Do not run docs/schema.sql for this deployment; that file is a legacy
-- Supabase-specific relational design reference.

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

-- Optional infrastructure metadata tables used by the repository layer.
CREATE TABLE IF NOT EXISTS public.orbit_images (
  id bigint PRIMARY KEY,
  shard_id integer NOT NULL,
  machine_id text NOT NULL,
  replica_machines text[] NOT NULL DEFAULT '{}',
  key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  width integer,
  height integer,
  entity_id text,
  department_id text,
  employee_id text,
  type text NOT NULL DEFAULT 'general',
  metadata jsonb NOT NULL DEFAULT '{}',
  uploaded_by text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT valid_shard CHECK (shard_id >= 0 AND shard_id < 8192)
);

-- Upgrade an installation created before updated_at was added.
ALTER TABLE public.orbit_images
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS orbit_images_shard_idx
  ON public.orbit_images (shard_id);
CREATE INDEX IF NOT EXISTS orbit_images_entity_idx
  ON public.orbit_images (entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orbit_images_dept_idx
  ON public.orbit_images (department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orbit_images_emp_idx
  ON public.orbit_images (employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS orbit_images_machine_idx
  ON public.orbit_images (machine_id);

CREATE TABLE IF NOT EXISTS public.orbit_id_sequences (
  shard_id integer PRIMARY KEY,
  last_timestamp bigint NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0,
  generator_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orbit_cache_invalidations (
  id bigserial PRIMARY KEY,
  cache_key text NOT NULL,
  invalidated_by text,
  invalidated_at timestamptz NOT NULL DEFAULT now(),
  related_ids bigint[]
);

CREATE TABLE IF NOT EXISTS public.orbit_infra_health (
  id bigserial PRIMARY KEY,
  component text NOT NULL,
  status text NOT NULL,
  details jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
