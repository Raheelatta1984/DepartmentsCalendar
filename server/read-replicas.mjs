/**
 * Read Replicas and Memcached Integration
 * 
 * This module provides:
 * 1. Read replica configuration for Neon (using Neon read replicas)
 * 2. Memcached caching layer for read-heavy queries
 * 3. Query routing between primary and replicas
 * 4. Cache invalidation strategies
 */

import { createHash } from 'node:crypto';

// Memcached configuration defaults
export const MEMCACHED_DEFAULTS = {
  hosts: ['localhost:11211'],           // Memcached server(s)
  prefix: 'orbit:',                     // Key prefix for namespacing
  ttl: 300,                             // Default TTL in seconds (5 minutes)
  maxKeySize: 250,                      // Maximum key size
  maxValueSize: 1024 * 1024,            // Maximum value size (1MB)
  poolSize: 10,                         // Connection pool size
  timeout: 5000,                        // Operation timeout (ms)
  retries: 2,                           // Number of retries
  retryDelay: 100,                      // Retry delay (ms)
  failover: true,                       // Enable failover
  removeFailed: 3,                      // Remove server after N failures
  idleTimeout: 30000,                   // Idle connection timeout (ms)
};

// Read replica configuration
export const READ_REPLICA_DEFAULTS = {
  enabled: true,
  replicas: [],                         // Array of replica connection strings
  routingStrategy: 'round-robin',       // 'round-robin', 'random', 'least-connections'
  maxLag: 5000,                         // Maximum acceptable replication lag (ms)
  healthCheckInterval: 30000,           // Health check interval (ms)
  readOnly: true,                       // Enforce read-only on replicas
  fallbackToPrimary: true,              // Fallback to primary on replica failure
};

// Query types for routing
export const QUERY_TYPES = {
  READ: 'read',
  WRITE: 'write',
  ADMIN: 'admin',
};

/**
 * Simple in-memory cache fallback when Memcached is unavailable
 */
class InMemoryCache {
  constructor(options = {}) {
    this.ttl = options.ttl || MEMCACHED_DEFAULTS.ttl * 1000; // Convert to ms
    this.maxSize = options.maxSize || 10000;
    this.cache = new Map();
    this.timers = new Map();
  }

  _generateKey(key) {
    return `${MEMCACHED_DEFAULTS.prefix}${key}`;
  }

  _isExpired(entry) {
    return Date.now() > entry.expiresAt;
  }

  _evictIfNeeded() {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest 10% of entries
      const toRemove = Math.floor(this.maxSize * 0.1);
      const keys = Array.from(this.cache.keys());
      for (let i = 0; i < toRemove && i < keys.length; i++) {
        this.delete(keys[i]);
      }
    }
  }

  async get(key) {
    const fullKey = this._generateKey(key);
    const entry = this.cache.get(fullKey);
    if (!entry) return null;
    if (this._isExpired(entry)) {
      this.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, ttl = this.ttl) {
    this._evictIfNeeded();
    const fullKey = this._generateKey(key);
    const expiresAt = Date.now() + ttl;
    
    // Clear existing timer if any
    if (this.timers.has(fullKey)) {
      clearTimeout(this.timers.get(fullKey));
    }
    
    const timer = setTimeout(() => this.delete(key), ttl);
    this.timers.set(fullKey, timer);
    this.cache.set(fullKey, { value, expiresAt });
    return true;
  }

  async delete(key) {
    const fullKey = this._generateKey(key);
    if (this.timers.has(fullKey)) {
      clearTimeout(this.timers.get(fullKey));
      this.timers.delete(fullKey);
    }
    return this.cache.delete(fullKey);
  }

  async flush() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.cache.clear();
    return true;
  }

  async stats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Not tracked in simple implementation
    };
  }
}

/**
 * Memcached client wrapper with fallback to in-memory cache
 */
export class MemcachedClient {
  constructor(options = {}) {
    this.config = { ...MEMCACHED_DEFAULTS, ...options };
    this.client = null;
    this.useFallback = false;
    this.fallback = new InMemoryCache({ ttl: this.config.ttl * 1000 });
    
    // Try to initialize real memcached client
    this._initClient();
  }

  async _initClient() {
    try {
      // Dynamic import to avoid requiring memcached as hard dependency
      const Memcached = (await import('memcached')).default;
      this.client = new Memcached(this.config.hosts, {
        poolSize: this.config.poolSize,
        timeout: this.config.timeout,
        retries: this.config.retries,
        retry: this.config.retryDelay,
        failover: this.config.failover,
        remove: this.config.removeFailed,
        idle: this.config.idleTimeout,
      });
      
      // Test connection
      await this._testConnection();
      console.log('[Memcached] Connected successfully');
    } catch (error) {
      console.warn('[Memcached] Failed to connect, using in-memory fallback:', error.message);
      this.useFallback = true;
    }
  }

  async _testConnection() {
    return new Promise((resolve, reject) => {
      this.client.version((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  _hashKey(key) {
    // Ensure key length compliance
    const prefixed = `${this.config.prefix}${key}`;
    if (prefixed.length <= this.config.maxKeySize) return prefixed;
    // Hash long keys
    return `${this.config.prefix}${createHash('sha256').update(prefixed).digest('hex').substring(0, 32)}`;
  }

  async get(key) {
    if (this.useFallback || !this.client) {
      return this.fallback.get(key);
    }
    
    return new Promise((resolve) => {
      this.client.get(this._hashKey(key), (err, value) => {
        if (err) {
          console.warn('[Memcached] Get error, falling back:', err.message);
          this.useFallback = true;
          resolve(this.fallback.get(key));
        } else {
          resolve(value ?? null);
        }
      });
    });
  }

  async set(key, value, ttl = this.config.ttl) {
    if (this.useFallback || !this.client) {
      return this.fallback.set(key, value, ttl * 1000);
    }
    
    return new Promise((resolve) => {
      this.client.set(this._hashKey(key), value, ttl, (err) => {
        if (err) {
          console.warn('[Memcached] Set error, falling back:', err.message);
          this.useFallback = true;
          resolve(this.fallback.set(key, value, ttl * 1000));
        } else {
          resolve(true);
        }
      });
    });
  }

  async delete(key) {
    if (this.useFallback || !this.client) {
      return this.fallback.delete(key);
    }
    
    return new Promise((resolve) => {
      this.client.del(this._hashKey(key), (err) => {
        if (err) {
          console.warn('[Memcached] Delete error, falling back:', err.message);
          this.useFallback = true;
          resolve(this.fallback.delete(key));
        } else {
          resolve(true);
        }
      });
    });
  }

  async flush() {
    if (this.useFallback || !this.client) {
      return this.fallback.flush();
    }
    
    return new Promise((resolve) => {
      this.client.flush((err) => {
        if (err) {
          console.warn('[Memcached] Flush error, falling back:', err.message);
          this.useFallback = true;
          resolve(this.fallback.flush());
        } else {
          resolve(true);
        }
      });
    });
  }

  async stats() {
    if (this.useFallback || !this.client) {
      return this.fallback.stats();
    }
    
    return new Promise((resolve) => {
      this.client.stats((err, stats) => {
        if (err) {
          console.warn('[Memcached] Stats error:', err.message);
          resolve(this.fallback.stats());
        } else {
          resolve(stats);
        }
      });
    });
  }
}

/**
 * Read Replica Manager
 * Handles connection pooling and query routing to read replicas
 */
export class ReadReplicaManager {
  constructor(primaryConfig, replicaConfigs = [], options = {}) {
    this.primaryConfig = primaryConfig;
    this.replicaConfigs = replicaConfigs;
    this.config = { ...READ_REPLICA_DEFAULTS, ...options };
    this.replicas = [];
    this.currentIndex = 0;
    this.healthStatus = new Map(); // replica index -> { healthy, lag, lastCheck }
    this.pool = null;
    
    this._initReplicas();
    this._startHealthChecks();
  }

  _initReplicas() {
    // Parse replica connection strings
    this.replicaConfigs.forEach((config, index) => {
      this.replicas.push({
        index,
        config,
        pool: null, // Will be initialized lazily
        healthy: true,
        lag: 0,
        connections: 0,
      });
      this.healthStatus.set(index, { healthy: true, lag: 0, lastCheck: Date.now() });
    });
  }

  async _startHealthChecks() {
    if (!this.config.enabled || this.replicas.length === 0) return;
    
    setInterval(async () => {
      await this._checkReplicaHealth();
    }, this.config.healthCheckInterval);
  }

  async _checkReplicaHealth() {
    for (const replica of this.replicas) {
      try {
        // In a real implementation, this would check pg_stat_replication
        // For now, we'll simulate health checks
        const start = Date.now();
        // Simulate query: SELECT pg_last_xact_replay_timestamp()
        await new Promise(r => setTimeout(r, 1)); // Mock
        const lag = Date.now() - start;
        
        replica.lag = lag;
        replica.healthy = lag <= this.config.maxLag;
        this.healthStatus.set(replica.index, { 
          healthy: replica.healthy, 
          lag, 
          lastCheck: Date.now() 
        });
      } catch (error) {
        replica.healthy = false;
        this.healthStatus.set(replica.index, { 
          healthy: false, 
          lag: Infinity, 
          lastCheck: Date.now() 
        });
      }
    }
  }

  /**
   * Get a healthy replica for read queries
   * @returns {Object|null} Replica config or null if none available
   */
  getReadReplica() {
    if (!this.config.enabled || this.replicas.length === 0) return null;
    
    const healthyReplicas = this.replicas.filter(r => r.healthy);
    if (healthyReplicas.length === 0) {
      if (this.config.fallbackToPrimary) return null; // Will use primary
      throw new Error('No healthy read replicas available');
    }
    
    switch (this.config.routingStrategy) {
      case 'random':
        return healthyReplicas[Math.floor(Math.random() * healthyReplicas.length)];
      case 'least-connections':
        return healthyReplicas.reduce((min, r) => r.connections < min.connections ? r : min);
      case 'round-robin':
      default:
        const replica = healthyReplicas[this.currentIndex % healthyReplicas.length];
        this.currentIndex = (this.currentIndex + 1) % healthyReplicas.length;
        return replica;
    }
  }

  /**
   * Execute a read query with automatic routing
   * @param {Function} queryFn - Query function that accepts a connection
   * @returns {Promise<any>} Query result
   */
  async executeRead(queryFn) {
    const replica = this.getReadReplica();
    
    if (replica) {
      replica.connections++;
      try {
        // In real implementation, use replica.pool
        // For now, we'll use the primary config as placeholder
        return await queryFn(this.primaryConfig, { replica: true, replicaIndex: replica.index });
      } finally {
        replica.connections--;
      }
    }
    
    // Fallback to primary
    return await queryFn(this.primaryConfig, { replica: false });
  }

  /**
   * Execute a write query (always goes to primary)
   * @param {Function} queryFn - Query function
   * @returns {Promise<any>} Query result
   */
  async executeWrite(queryFn) {
    return await queryFn(this.primaryConfig, { replica: false, write: true });
  }

  getHealthStatus() {
    const status = {};
    for (const [index, health] of this.healthStatus) {
      status[index] = { ...health };
    }
    return status;
  }
}

/**
 * Cache key generators for common query patterns
 */
export const CacheKeys = {
  workspace: (version) => `workspace:v${version}`,
  workspaceLatest: () => 'workspace:latest',
  entity: (id) => `entity:${id}`,
  entities: (filters) => `entities:${createHash('md5').update(JSON.stringify(filters)).digest('hex')}`,
  department: (id) => `department:${id}`,
  departments: (entityId) => `departments:${entityId}`,
  employee: (id) => `employee:${id}`,
  employees: (filters) => `employees:${createHash('md5').update(JSON.stringify(filters)).digest('hex')}`,
  activity: (id) => `activity:${id}`,
  activities: (filters) => `activities:${createHash('md5').update(JSON.stringify(filters)).digest('hex')}`,
  timeEntries: (filters) => `timeEntries:${createHash('md5').update(JSON.stringify(filters)).digest('hex')}`,
  holidays: (countryCode, year) => `holidays:${countryCode}:${year}`,
  settings: () => 'settings',
  escalations: (filters) => `escalations:${createHash('md5').update(JSON.stringify(filters)).digest('hex')}`,
  projects: (filters) => `projects:${createHash('md5').update(JSON.stringify(filters)).digest('hex')}`,
  capitalisation: (entityId, period) => `cap:${entityId}:${period}`,
};

/**
 * Cache TTL recommendations by data type
 */
export const CacheTTL = {
  workspace: 60,           // 1 minute - changes frequently
  reference: 3600,         // 1 hour - countries, entities, departments
  employee: 300,           // 5 minutes - employee data
  activity: 120,           // 2 minutes - activities
  timeEntries: 60,         // 1 minute - time entries
  holidays: 86400,         // 24 hours - holidays rarely change
  settings: 3600,          // 1 hour - settings
  escalations: 300,        // 5 minutes - escalations
  projects: 300,           // 5 minutes - projects
  capitalisation: 600,     // 10 minutes - capitalisation
  analytics: 120,          // 2 minutes - computed analytics
};

/**
 * Create a cached query executor
 * @param {MemcachedClient} cache - Memcached client
 * @param {ReadReplicaManager} replicas - Read replica manager
 * @returns {Object} Cached query executor
 */
export function createCachedExecutor(cache, replicas) {
  return {
    /**
     * Execute a read query with caching
     * @param {string} cacheKey - Cache key
     * @param {Function} queryFn - Query function
     * @param {number} ttl - Cache TTL in seconds
     * @returns {Promise<any>} Query result
     */
    async read(cacheKey, queryFn, ttl = CacheTTL.reference) {
      // Try cache first
      const cached = await cache.get(cacheKey);
      if (cached !== null) {
        return { data: cached, cached: true };
      }
      
      // Execute query on replica
      const result = await replicas.executeRead(queryFn);
      
      // Cache result
      await cache.set(cacheKey, result, ttl);
      
      return { data: result, cached: false };
    },

    /**
     * Execute a write query with cache invalidation
     * @param {string[]} invalidationKeys - Cache keys to invalidate
     * @param {Function} queryFn - Query function
     * @returns {Promise<any>} Query result
     */
    async write(invalidationKeys, queryFn) {
      const result = await replicas.executeWrite(queryFn);
      
      // Invalidate related cache entries
      await Promise.all(invalidationKeys.map(key => cache.delete(key)));
      
      return result;
    },

    /**
     * Invalidate cache keys
     * @param {string[]} keys - Cache keys to invalidate
     */
    async invalidate(keys) {
      await Promise.all(keys.map(key => cache.delete(key)));
    },

    /**
     * Invalidate by pattern (prefix)
     * @param {string} prefix - Key prefix to invalidate
     */
    async invalidatePattern(prefix) {
      // Note: Memcached doesn't support pattern deletion natively
      // This would require a separate key tracking mechanism
      // For now, we'll flush if needed (use with caution)
      if (prefix === 'all') {
        await cache.flush();
      }
    },
  };
}

export default {
  MemcachedClient,
  ReadReplicaManager,
  createCachedExecutor,
  CacheKeys,
  CacheTTL,
  MEMCACHED_DEFAULTS,
  READ_REPLICA_DEFAULTS,
  QUERY_TYPES,
};