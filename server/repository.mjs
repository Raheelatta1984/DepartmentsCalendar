import { neon } from '@neondatabase/serverless';
import { createInfrastructureFromEnv } from './infrastructure.mjs';

/**
 * Enhanced database migrations with new infrastructure support
 * Includes tables for:
 * - Workspace state (existing)
 * - Login limits (existing)
 * - Image metadata with shard tracking
 * - ID generation sequences (for coordination)
 * - Cache invalidation logs
 */

export const migrations = [
  // Existing workspace table
  `CREATE TABLE IF NOT EXISTS public.orbit_workspace (
    id smallint PRIMARY KEY CHECK (id = 1),
    version integer NOT NULL CHECK (version > 0),
    state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  
  // Existing login limits table
  `CREATE TABLE IF NOT EXISTS public.orbit_login_limits (
    key text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    attempts integer NOT NULL CHECK (attempts > 0)
  )`,
  
  // Image metadata table with shard tracking
  `CREATE TABLE IF NOT EXISTS public.orbit_images (
    id bigint PRIMARY KEY,           -- 64-bit NextID
    shard_id integer NOT NULL,       -- Logical shard (0-8191)
    machine_id text NOT NULL,        -- Primary machine ID
    replica_machines text[] NOT NULL DEFAULT '{}', -- Replica machine IDs
    key text NOT NULL UNIQUE,        -- Full image key
    original_name text NOT NULL,     -- Original filename
    mime_type text NOT NULL,         -- MIME type
    size_bytes bigint NOT NULL,      -- File size
    width integer,                   -- Image width
    height integer,                  -- Image height
    entity_id text,                  -- Entity reference
    department_id text,              -- Department reference
    employee_id text,                -- Employee reference
    type text NOT NULL DEFAULT 'general', -- Image type
    metadata jsonb NOT NULL DEFAULT '{}', -- Additional metadata
    uploaded_by text,                -- Uploader reference
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT valid_shard CHECK (shard_id >= 0 AND shard_id < 8192)
  )`,
  
  // Index for shard-based queries
  `CREATE INDEX IF NOT EXISTS orbit_images_shard_idx ON public.orbit_images (shard_id)`,
  
  // Index for entity/department/employee lookups
  `CREATE INDEX IF NOT EXISTS orbit_images_entity_idx ON public.orbit_images (entity_id) WHERE entity_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS orbit_images_dept_idx ON public.orbit_images (department_id) WHERE department_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS orbit_images_emp_idx ON public.orbit_images (employee_id) WHERE employee_id IS NOT NULL`,
  
  // Index for machine-based queries (for rebalancing)
  `CREATE INDEX IF NOT EXISTS orbit_images_machine_idx ON public.orbit_images (machine_id)`,
  
  // ID generation coordination table (for distributed generators)
  `CREATE TABLE IF NOT EXISTS public.orbit_id_sequences (
    shard_id integer PRIMARY KEY,    -- Shard ID (0-8191)
    last_timestamp bigint NOT NULL,  -- Last timestamp used
    last_sequence integer NOT NULL DEFAULT 0, -- Last sequence used
    generator_id text NOT NULL,      -- Unique generator identifier
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  
  // Cache invalidation log (for debugging/auditing)
  `CREATE TABLE IF NOT EXISTS public.orbit_cache_invalidations (
    id bigserial PRIMARY KEY,
    cache_key text NOT NULL,
    invalidated_by text,             -- Operation that caused invalidation
    invalidated_at timestamptz NOT NULL DEFAULT now(),
    related_ids bigint[]             -- Related NextIDs
  )`,
  
  // Infrastructure health checks log
  `CREATE TABLE IF NOT EXISTS public.orbit_infra_health (
    id bigserial PRIMARY KEY,
    component text NOT NULL,         -- 'database', 'replica', 'memcached', 'sharding'
    status text NOT NULL,            -- 'healthy', 'degraded', 'unhealthy'
    details jsonb,
    checked_at timestamptz NOT NULL DEFAULT now()
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
    
    // Image management methods
    async saveImage(imageData) {
      const { id, shardId, machineId, replicaMachines, key, ...rest } = imageData;
      const rows = await query(
        `INSERT INTO public.orbit_images 
          (id, shard_id, machine_id, replica_machines, key, original_name, mime_type, size_bytes, 
           width, height, entity_id, department_id, employee_id, type, metadata, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (key) DO UPDATE SET
           shard_id = EXCLUDED.shard_id,
           machine_id = EXCLUDED.machine_id,
           replica_machines = EXCLUDED.replica_machines,
           size_bytes = EXCLUDED.size_bytes,
           width = EXCLUDED.width,
           height = EXCLUDED.height,
           entity_id = EXCLUDED.entity_id,
           department_id = EXCLUDED.department_id,
           employee_id = EXCLUDED.employee_id,
           type = EXCLUDED.type,
           metadata = EXCLUDED.metadata,
           uploaded_by = EXCLUDED.uploaded_by,
           uploaded_at = now()
         RETURNING *`,
        [id, shardId, machineId, replicaMachines, key, rest.originalName, rest.mimeType, rest.sizeBytes,
         rest.width, rest.height, rest.entityId, rest.departmentId, rest.employeeId, rest.type, 
         JSON.stringify(rest.metadata || {}), rest.uploadedBy]
      );
      return rows[0];
    },
    
    async getImageByKey(key) {
      const rows = await query('SELECT * FROM public.orbit_images WHERE key = $1 AND deleted_at IS NULL', [key]);
      return rows[0] ?? null;
    },
    
    async getImagesByShard(shardId, limit = 100, offset = 0) {
      const rows = await query(
        'SELECT * FROM public.orbit_images WHERE shard_id = $1 AND deleted_at IS NULL ORDER BY uploaded_at DESC LIMIT $2 OFFSET $3',
        [shardId, limit, offset]
      );
      return rows;
    },
    
    async getImagesByEntity(entityId, limit = 100, offset = 0) {
      const rows = await query(
        'SELECT * FROM public.orbit_images WHERE entity_id = $1 AND deleted_at IS NULL ORDER BY uploaded_at DESC LIMIT $2 OFFSET $3',
        [entityId, limit, offset]
      );
      return rows;
    },
    
    async deleteImage(key) {
      const rows = await query(
        'UPDATE public.orbit_images SET deleted_at = now() WHERE key = $1 RETURNING *',
        [key]
      );
      return rows[0] ?? null;
    },
    
    async moveImageShard(key, newShardId, newMachineId, newReplicaMachines) {
      const rows = await query(
        `UPDATE public.orbit_images 
         SET shard_id = $2, machine_id = $3, replica_machines = $4, updated_at = now()
         WHERE key = $1 RETURNING *`,
        [key, newShardId, newMachineId, newReplicaMachines]
      );
      return rows[0] ?? null;
    },
    
    // ID sequence coordination
    async reserveIdSequence(shardId, generatorId, count = 1) {
      const rows = await query(
        `INSERT INTO public.orbit_id_sequences (shard_id, last_timestamp, last_sequence, generator_id)
         VALUES ($1, 0, 0, $2)
         ON CONFLICT (shard_id) DO UPDATE SET
           generator_id = EXCLUDED.generator_id,
           updated_at = now()
         RETURNING *`,
        [shardId, generatorId]
      );
      return rows[0];
    },
    
    async updateIdSequence(shardId, timestamp, sequence) {
      const rows = await query(
        `UPDATE public.orbit_id_sequences 
         SET last_timestamp = $2, last_sequence = $3, updated_at = now()
         WHERE shard_id = $1 RETURNING *`,
        [shardId, timestamp, sequence]
      );
      return rows[0];
    },
    
    async getIdSequence(shardId) {
      const rows = await query('SELECT * FROM public.orbit_id_sequences WHERE shard_id = $1', [shardId]);
      return rows[0] ?? null;
    },
    
    // Cache invalidation logging
    async logCacheInvalidation(cacheKey, invalidatedBy, relatedIds = []) {
      await query(
        `INSERT INTO public.orbit_cache_invalidations (cache_key, invalidated_by, related_ids)
         VALUES ($1, $2, $3)`,
        [cacheKey, invalidatedBy, relatedIds]
      );
    },
    
    // Infrastructure health logging
    async logInfraHealth(component, status, details = {}) {
      await query(
        `INSERT INTO public.orbit_infra_health (component, status, details)
         VALUES ($1, $2, $3)`,
        [component, status, JSON.stringify(details)]
      );
    },
  };
}

export function createNeonRepository(connectionString) {
  const sql = neon(connectionString);
  return createRepository((query, parameters = []) => sql.query(query, parameters, {
    fetchOptions: { signal: AbortSignal.timeout(15_000) },
  }));
}

/**
 * Create repository with full infrastructure integration
 */
export async function createInfrastructureRepository(config = {}) {
  const infrastructure = createInfrastructureFromEnv(config);
  await infrastructure.initialize();
  
  const connectionString = infrastructure.getDatabaseConnectionString();
  const repository = createNeonRepository(connectionString);
  await repository.initialize();
  
  return {
    ...repository,
    infrastructure,
    // Enhanced methods using infrastructure
    nextId: (options) => infrastructure.nextId(options),
    nextIdForKey: (key, options) => infrastructure.nextIdForKey(key, options),
    generateImageKey: (metadata) => infrastructure.generateImageKey(metadata),
    cachedRead: (key, fn, ttl) => infrastructure.cachedRead(key, fn, ttl),
    cachedWrite: (keys, fn) => infrastructure.cachedWrite(keys, fn),
    invalidateCache: (keys) => infrastructure.invalidateCache(keys),
    getHealthStatus: () => infrastructure.getHealthStatus(),
  };
}

export default {
  migrations,
  createRepository,
  createNeonRepository,
  createInfrastructureRepository,
};