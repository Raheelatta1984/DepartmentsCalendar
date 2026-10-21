import { neon } from '@neondatabase/serverless';

export const migrations = [
  `CREATE TABLE IF NOT EXISTS public.orbit_workspace (
    id smallint PRIMARY KEY CHECK (id = 1),
    version integer NOT NULL CHECK (version > 0),
    state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS public.orbit_login_limits (
    key text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    attempts integer NOT NULL CHECK (attempts > 0)
  )`,
];

export function createRepository(query) {
  let initialization;
  return {
    initialize() {
      initialization ??= (async () => {
        for (const migration of migrations) await query(migration);
      })().catch((error) => {
        initialization = undefined; // a transient Neon wake-up error must be retryable
        throw error;
      });
      return initialization;
    },
    async read() {
      const rows = await query('SELECT state, version, updated_at FROM public.orbit_workspace WHERE id = 1');
      return rows[0] ?? { state: null, version: 0, updated_at: null };
    },
    async save(version, state) {
      const json = JSON.stringify(state);
      const rows = version === 0
        ? await query(`INSERT INTO public.orbit_workspace (id, version, state)
            VALUES (1, 1, $1::jsonb) ON CONFLICT (id) DO NOTHING RETURNING version, updated_at`, [json])
        : await query(`UPDATE public.orbit_workspace SET state = $1::jsonb,
            version = version + 1, updated_at = now()
            WHERE id = 1 AND version = $2 RETURNING version, updated_at`, [json, version]);
      // The WHERE / ON CONFLICT guards are atomic in Postgres, including across
      // different Vercel instances. A stale browser can never overwrite a newer one.
      return rows[0] ?? null;
    },
    async consumeLoginAttempt(key, now = new Date()) {
      await query("DELETE FROM public.orbit_login_limits WHERE window_start < $1::timestamptz - interval '1 day'", [now.toISOString()]);
      const rows = await query(`INSERT INTO public.orbit_login_limits (key, window_start, attempts)
          VALUES ($1, $2::timestamptz, 1)
          ON CONFLICT (key) DO UPDATE SET
            attempts = CASE WHEN orbit_login_limits.window_start <= $2::timestamptz - interval '15 minutes'
              THEN 1 ELSE orbit_login_limits.attempts + 1 END,
            window_start = CASE WHEN orbit_login_limits.window_start <= $2::timestamptz - interval '15 minutes'
              THEN $2::timestamptz ELSE orbit_login_limits.window_start END
          RETURNING attempts`, [key, now.toISOString()]);
      return rows[0].attempts <= 20;
    },
  };
}

export function createNeonRepository(connectionString) {
  const sql = neon(connectionString);
  return createRepository((query, parameters = []) => sql.query(query, parameters, {
    fetchOptions: { signal: AbortSignal.timeout(15_000) },
  }));
}
