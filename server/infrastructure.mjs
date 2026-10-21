/**
 * Infrastructure Integration Layer
 * 
 * Combines PgBouncer, Read Replicas, Memcached, Image Sharding, and ID Generation
 * into a unified infrastructure configuration for the Departments Calendar application.
 */

import { 
  createPooledConnectionString, 
  validatePgBouncerConfig,
  generatePgBouncerConfig 
} from './pgbouncer.mjs';

import { 
  MemcachedClient, 
  ReadReplicaManager, 
  createCachedExecutor,
  CacheKeys,
  CacheTTL,
  MEMCACHED_DEFAULTS,
  READ_REPLICA_DEFAULTS 
} from './read-replicas.mjs';

import { 
  ShardManager, 
  ImageKeyGenerator,
  ConsistentHashRing,
  SHARD_CONFIG 
} from './image-sharding.mjs';

import { 
  NextIDGenerator, 
  DistributedIDCoordinator, 
  IDUtils,
  defaultGenerator,
  defaultCoordinator 
} from './id-generator.mjs';

/**
 * Infrastructure configuration
 */
export const INFRASTRUCTURE_DEFAULTS = {
  // Database
  database: {
    url: process.env.DATABASE_URL,
    poolerUrl: process.env.DATABASE_POOLER_URL,
    usePooler: true,
    poolSize: 20,
    statementTimeout: 15000,
    idleTimeout: 10000,
    maxRetries: 3,
  },
  
  // PgBouncer
  pgbouncer: {
    enabled: true,
    poolMode: 'session',
    defaultPoolSize: 25,
    maxClientConn: 1000,
  },
  
  // Read Replicas
  readReplicas: {
    enabled: process.env.READ_REPLICA_URLS ? true : false,
    replicaUrls: process.env.READ_REPLICA_URLS 
      ? process.env.READ_REPLICA_URLS.split(',').map(u => u.trim())
      : [],
    routingStrategy: 'round-robin',
    maxLag: 5000,
  },
  
  // Memcached
  memcached: {
    enabled: process.env.MEMCACHED_HOSTS ? true : false,
    hosts: process.env.MEMCACHED_HOSTS 
      ? process.env.MEMCACHED_HOSTS.split(',').map(h => h.trim())
      : ['localhost:11211'],
    prefix: 'orbit:',
    ttl: 300,
  },
  
  // Image Sharding
  imageSharding: {
    enabled: true,
    totalShards: 8192,
    replicationFactor: 3,
    virtualNodes: 160,
    machines: [], // Will be populated from env or config
  },
  
  // ID Generation
  idGeneration: {
    epoch: 1704067200000, // 2024-01-01
    shardId: parseInt(process.env.SHARD_ID || '0', 10),
    maxDriftMs: 1000,
  },
};

/**
 * Infrastructure Manager - Central coordinator for all infrastructure components
 */
export class InfrastructureManager {
  constructor(config = {}) {
    this.config = this._mergeConfig(INFRASTRUCTURE_DEFAULTS, config);
    this.initialized = false;
    this.components = {};
  }

  _mergeConfig(defaults, config) {
    const merged = JSON.parse(JSON.stringify(defaults));
    for (const [key, value] of Object.entries(config)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = { ...merged[key], ...value };
      } else {
        merged[key] = value;
      }
    }
    return merged;
  }

  /**
   * Initialize all infrastructure components
   */
  async initialize() {
    if (this.initialized) return this.components;
    
    console.log('[Infrastructure] Initializing components...');
    
    // 1. Database Connection (with PgBouncer pooling)
    this.components.database = await this._initDatabase();
    
    // 2. Read Replicas
    this.components.readReplicas = await this._initReadReplicas();
    
    // 3. Memcached
    this.components.memcached = await this._initMemcached();
    
    // 4. Cached Query Executor
    this.components.cachedExecutor = createCachedExecutor(
      this.components.memcached,
      this.components.readReplicas
    );
    
    // 5. Image Sharding
    this.components.imageSharding = await this._initImageSharding();
    
    // 6. ID Generation
    this.components.idGenerator = this._initIdGenerator();
    this.components.idCoordinator = this._initIdCoordinator();
    
    this.initialized = true;
    console.log('[Infrastructure] All components initialized');
    
    return this.components;
  }

  async _initDatabase() {
    const { database, pgbouncer } = this.config;
    
    let connectionString = database.url || '';
    
    // Use pooler URL if available (Neon built-in PgBouncer)
    if (pgbouncer.enabled && database.usePooler && database.poolerUrl) {
      connectionString = database.poolerUrl;
    } else if (pgbouncer.enabled && database.usePooler && database.url) {
      // Convert to pooler endpoint
      connectionString = createPooledConnectionString(database.url);
    }
    
    // Validate PgBouncer config if custom config provided
    if (pgbouncer.enabled && pgbouncer.customConfig) {
      const validation = validatePgBouncerConfig(pgbouncer.customConfig);
      if (!validation.valid) {
        console.warn('[Infrastructure] PgBouncer config validation failed:', validation.errors);
      }
    }
    
    return {
      connectionString,
      config: { ...database, pgbouncer },
      // Neon serverless driver will be created by repository
      // This is just the configuration
    };
  }

  async _initReadReplicas() {
    const { readReplicas } = this.config;
    
    if (!readReplicas.enabled || readReplicas.replicaUrls.length === 0) {
      console.log('[Infrastructure] Read replicas disabled (no replica URLs configured)');
      return {
        enabled: false,
        manager: null,
        executeRead: async (fn) => fn(this.components.database.connectionString, { replica: false }),
        executeWrite: async (fn) => fn(this.components.database.connectionString, { write: true }),
      };
    }
    
    const manager = new ReadReplicaManager(
      this.components.database.connectionString,
      readReplicas.replicaUrls,
      {
        routingStrategy: readReplicas.routingStrategy,
        maxLag: readReplicas.maxLag,
        fallbackToPrimary: true,
      }
    );
    
    return {
      enabled: true,
      manager,
      executeRead: (fn) => manager.executeRead(fn),
      executeWrite: (fn) => manager.executeWrite(fn),
      getHealthStatus: () => manager.getHealthStatus(),
    };
  }

  async _initMemcached() {
    const { memcached } = this.config;
    
    const client = new MemcachedClient({
      hosts: memcached.hosts,
      prefix: memcached.prefix,
      ttl: memcached.ttl,
    });
    
    // Wait a bit for connection to establish
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return client;
  }

  async _initImageSharding() {
    const { imageSharding } = this.config;
    
    const shardManager = new ShardManager({
      totalShards: imageSharding.totalShards,
      replicationFactor: imageSharding.replicationFactor,
      virtualNodes: imageSharding.virtualNodes,
    });
    
    // Register machines from config
    for (const machine of imageSharding.machines) {
      shardManager.registerMachine(machine);
    }
    
    // If no machines configured, register a default local machine
    if (imageSharding.machines.length === 0) {
      shardManager.registerMachine({
        id: 'local-primary',
        region: 'local',
        zone: 'development',
        capacity: 100,
        status: 'active',
      });
    }
    
    const keyGenerator = new ImageKeyGenerator(shardManager, {
      prefix: 'orbit-img',
    });
    
    return {
      shardManager,
      keyGenerator,
      config: imageSharding,
    };
  }

  _initIdGenerator() {
    const { idGeneration } = this.config;
    
    return new NextIDGenerator({
      epoch: idGeneration.epoch,
      shardId: idGeneration.shardId,
      maxDriftMs: idGeneration.maxDriftMs,
    });
  }

  _initIdCoordinator() {
    const { idGeneration } = this.config;
    
    const coordinator = new DistributedIDCoordinator({
      epoch: idGeneration.epoch,
      defaultShardId: idGeneration.shardId,
    });
    
    // Set up shard resolver using image sharding if available
    if (this.components.imageSharding) {
      coordinator.setShardResolver((key) => {
        return this.components.imageSharding.shardManager.getMachineForKey(key) 
          ? this.components.imageSharding.shardManager._keyToShard(key)
          : idGeneration.shardId;
      });
    }
    
    return coordinator;
  }

  /**
   * Get database connection string for repository
   */
  getDatabaseConnectionString() {
    return this.components.database.connectionString;
  }

  /**
   * Generate next ID
   */
  nextId(options = {}) {
    return this.components.idGenerator.nextId(options);
  }

  /**
   * Generate next ID for a key (with shard resolution)
   */
  nextIdForKey(key, options = {}) {
    return this.components.idCoordinator.nextIdForKey(key, options);
  }

  /**
   * Generate image key with shard assignment
   */
  generateImageKey(metadata) {
    return this.components.imageSharding.keyGenerator.generateKey(metadata);
  }

  /**
   * Execute cached read query
   */
  async cachedRead(cacheKey, queryFn, ttl) {
    return this.components.cachedExecutor.read(cacheKey, queryFn, ttl);
  }

  /**
   * Execute write query with cache invalidation
   */
  async cachedWrite(invalidationKeys, queryFn) {
    return this.components.cachedExecutor.write(invalidationKeys, queryFn);
  }

  /**
   * Invalidate cache
   */
  async invalidateCache(keys) {
    return this.components.cachedExecutor.invalidate(keys);
  }

  /**
   * Get infrastructure health status
   */
  getHealthStatus() {
    return {
      initialized: this.initialized,
      database: {
        connected: !!this.components.database?.connectionString,
        pooler: this.config.pgbouncer.enabled,
      },
      readReplicas: this.components.readReplicas 
        ? { enabled: this.components.readReplicas.enabled, ...this.components.readReplicas.getHealthStatus?.() }
        : { enabled: false },
      memcached: {
        enabled: this.config.memcached.enabled,
        usingFallback: this.components.memcached?.useFallback || false,
      },
      imageSharding: this.components.imageSharding
        ? this.components.imageSharding.shardManager.getClusterStats()
        : null,
      idGeneration: {
        stats: this.components.idGenerator?.getStats(),
        coordinatorStats: this.components.idCoordinator?.getStats(),
      },
    };
  }

  /**
   * Export infrastructure state for persistence
   */
  exportState() {
    return {
      config: this.config,
      imageSharding: this.components.imageSharding?.shardManager.exportShardMap(),
      idGeneratorStats: this.components.idGenerator?.getStats(),
      exportedAt: Date.now(),
    };
  }

  /**
   * Import infrastructure state
   */
  importState(state) {
    if (state.imageSharding && this.components.imageSharding) {
      this.components.imageSharding.shardManager.importShardMap(state.imageSharding);
    }
  }
}

/**
 * Create infrastructure manager from environment
 */
export function createInfrastructureFromEnv(overrides = {}) {
  return new InfrastructureManager(overrides);
}

/**
 * Express/Connect middleware for infrastructure
 * Adds infrastructure utilities to request object
 */
export function infrastructureMiddleware(infrastructure) {
  return (req, res, next) => {
    req.infra = {
      nextId: (options) => infrastructure.nextId(options),
      nextIdForKey: (key, options) => infrastructure.nextIdForKey(key, options),
      generateImageKey: (metadata) => infrastructure.generateImageKey(metadata),
      cachedRead: (key, fn, ttl) => infrastructure.cachedRead(key, fn, ttl),
      cachedWrite: (keys, fn) => infrastructure.cachedWrite(keys, fn),
      invalidateCache: (keys) => infrastructure.invalidateCache(keys),
      parseId: (id) => infrastructure.components.idGenerator.parseId(id),
      idUtils: IDUtils,
    };
    next();
  };
}

export default {
  InfrastructureManager,
  createInfrastructureFromEnv,
  infrastructureMiddleware,
  INFRASTRUCTURE_DEFAULTS,
  // Re-export submodules
  CacheKeys,
  CacheTTL,
  IDUtils,
};