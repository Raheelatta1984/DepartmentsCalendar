/**
 * Request guard: protects the API and the Neon database from unnecessary load.
 *
 * Everything here is dependency-free and runs inside the function instance, so
 * it costs microseconds instead of a database round-trip. On Vercel each warm
 * instance keeps its own state; the persisted DB login limiter remains the
 * cross-instance source of truth, these guards simply shed load before it.
 *
 *  - BloomFilter   : probabilistic "have we definitely NOT seen this?" set.
 *                    Used as a cheap gate in front of exact lookups.
 *  - NegativeCache : bounded TTL cache for known misses / known failures
 *                    (empty workspace, invalid sessions, blocked clients,
 *                    database outage) so they are not re-queried.
 *  - RateLimiter   : sliding-window limiter per client and route class.
 *  - SingleFlight  : coalesces concurrent identical reads into one query.
 *  - ReadCache     : micro-cache for the workspace snapshot with ETag support.
 */

// ---------------------------------------------------------------------------
// Hashing (FNV-1a 32-bit, two seeds -> Kirsch–Mitzenmacher double hashing)
// ---------------------------------------------------------------------------
function fnv1a(value, seed = 0x811c9dc5) {
  let hash = seed >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export class BloomFilter {
  /**
   * @param {object} options
   * @param {number} options.expectedItems   capacity the filter is sized for
   * @param {number} options.falsePositiveRate target FP rate at capacity
   */
  constructor({ expectedItems = 10_000, falsePositiveRate = 0.01 } = {}) {
    this.expectedItems = expectedItems;
    this.falsePositiveRate = falsePositiveRate;
    const bits = Math.ceil(-(expectedItems * Math.log(falsePositiveRate)) / (Math.LN2 ** 2));
    this.size = Math.max(64, bits);
    this.hashes = Math.max(1, Math.round((this.size / expectedItems) * Math.LN2));
    this.bits = new Uint8Array(Math.ceil(this.size / 8));
    this.count = 0;
  }

  _positions(value) {
    const key = String(value);
    const h1 = fnv1a(key);
    const h2 = fnv1a(key, 0x9747b28c) | 1; // odd so it cycles the whole table
    const positions = new Array(this.hashes);
    for (let i = 0; i < this.hashes; i++) positions[i] = ((h1 + Math.imul(i, h2)) >>> 0) % this.size;
    return positions;
  }

  add(value) {
    for (const position of this._positions(value)) this.bits[position >> 3] |= 1 << (position & 7);
    this.count++;
    // Past ~2x capacity the FP rate degrades badly; a fresh filter is safer than
    // one that says "maybe" to everything (callers always verify exactly anyway).
    if (this.count > this.expectedItems * 2) this.reset();
    return this;
  }

  /** false => definitely never added; true => probably added (verify exactly). */
  has(value) {
    for (const position of this._positions(value)) {
      if ((this.bits[position >> 3] & (1 << (position & 7))) === 0) return false;
    }
    return true;
  }

  reset() { this.bits.fill(0); this.count = 0; }
}

// ---------------------------------------------------------------------------
// Bounded TTL map (LRU-ish by insertion order) shared by the caches below
// ---------------------------------------------------------------------------
class TtlMap {
  constructor(maxEntries = 5_000) { this.max = maxEntries; this.map = new Map(); }

  get(key, now = Date.now()) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires <= now) { this.map.delete(key); return undefined; }
    return entry;
  }

  set(key, value, ttlMs, now = Date.now()) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expires: now + ttlMs });
    if (this.map.size > this.max) this.sweep(now);
    return value;
  }

  delete(key) { return this.map.delete(key); }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }

  sweep(now = Date.now()) {
    for (const [key, entry] of this.map) if (entry.expires <= now) this.map.delete(key);
    // Still over budget: evict oldest insertions.
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }
}

// ---------------------------------------------------------------------------
// Negative cache
// ---------------------------------------------------------------------------
export class NegativeCache {
  /**
   * Remembers things that are known to be absent or known to fail, so the same
   * miss is not paid for twice. A Bloom filter sits in front: a Bloom miss means
   * "definitely not cached" and skips the map lookup entirely; a Bloom hit means
   * "maybe", and the exact TTL map decides.
   */
  constructor({ maxEntries = 5_000, defaultTtlMs = 30_000, expectedItems = 20_000 } = {}) {
    this.defaultTtlMs = defaultTtlMs;
    this.store = new TtlMap(maxEntries);
    this.bloom = new BloomFilter({ expectedItems, falsePositiveRate: 0.01 });
    this.stats = { hits: 0, misses: 0, bloomSkips: 0 };
  }

  /** @returns {undefined | { value: any, expires: number }} */
  lookup(key, now = Date.now()) {
    if (!this.bloom.has(key)) { this.stats.bloomSkips++; return undefined; }
    const entry = this.store.get(key, now);
    if (entry) this.stats.hits++; else this.stats.misses++;
    return entry;
  }

  has(key, now = Date.now()) { return this.lookup(key, now) !== undefined; }

  remember(key, value = true, ttlMs = this.defaultTtlMs, now = Date.now()) {
    this.bloom.add(key);
    this.store.set(key, value, ttlMs, now);
    return value;
  }

  forget(key) { this.store.delete(key); }
  clear() { this.store.clear(); this.bloom.reset(); }
}

// ---------------------------------------------------------------------------
// Rate limiter (sliding window counter)
// ---------------------------------------------------------------------------
export class RateLimiter {
  /**
   * @param {object} options
   * @param {number} options.maxKeys max tracked (client, route) pairs
   */
  constructor({ maxKeys = 20_000 } = {}) { this.buckets = new TtlMap(maxKeys); }

  /**
   * Sliding-window approximation: weight the previous window by how much of it
   * still overlaps the current one. Smooth, memory-light, no timestamps array.
   * @returns {{ allowed: boolean, limit: number, remaining: number, retryAfterSeconds: number, resetSeconds: number }}
   */
  consume(key, { limit, windowMs }, now = Date.now()) {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const entry = this.buckets.get(key, now)?.value ?? { windowStart, current: 0, previous: 0 };
    if (entry.windowStart !== windowStart) {
      entry.previous = windowStart - entry.windowStart === windowMs ? entry.current : 0;
      entry.current = 0;
      entry.windowStart = windowStart;
    }
    const elapsedFraction = (now - windowStart) / windowMs;
    const estimated = entry.previous * (1 - elapsedFraction) + entry.current;
    const allowed = estimated + 1 <= limit;
    if (allowed) entry.current++;
    this.buckets.set(key, entry, windowMs * 2, now);
    const resetSeconds = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
    return {
      allowed, limit,
      remaining: Math.max(0, Math.floor(limit - estimated - (allowed ? 1 : 0))),
      retryAfterSeconds: allowed ? 0 : resetSeconds,
      resetSeconds,
    };
  }

  reset() { this.buckets.clear(); }
}

// ---------------------------------------------------------------------------
// Single-flight: concurrent callers share one in-flight promise
// ---------------------------------------------------------------------------
export class SingleFlight {
  constructor() { this.inflight = new Map(); }

  run(key, work) {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const promise = Promise.resolve().then(work).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}

// ---------------------------------------------------------------------------
// Workspace read cache with ETag
// ---------------------------------------------------------------------------
export const etagFor = (version, updatedAt) => `W/"ws-${version}-${updatedAt ? new Date(updatedAt).getTime() : 0}"`;

export class ReadCache {
  constructor({ ttlMs = 5_000 } = {}) { this.ttlMs = ttlMs; this.entry = undefined; this.stats = { hits: 0, misses: 0 }; }

  get(now = Date.now()) {
    if (this.entry && this.entry.expires > now) { this.stats.hits++; return this.entry.snapshot; }
    this.stats.misses++;
    return undefined;
  }

  set(snapshot, now = Date.now()) {
    this.entry = { snapshot, expires: now + this.ttlMs };
    return snapshot;
  }

  invalidate() { this.entry = undefined; }
}

// ---------------------------------------------------------------------------
// Policies and the composed guard
// ---------------------------------------------------------------------------
const MINUTE = 60_000;

/** Per-client limits by route class. Tuned for a collaborative workspace UI. */
export const DEFAULT_POLICIES = {
  config:         { limit: 120, windowMs: MINUTE },   // cheap, no DB
  'session:login':{ limit: 10,  windowMs: MINUTE },   // brute-force surface
  'session:logout':{ limit: 30, windowMs: MINUTE },
  'workspace:read':{ limit: 60, windowMs: MINUTE },   // focus refresh is >= 60 s apart
  'workspace:write':{ limit: 40, windowMs: MINUTE },  // 600 ms debounce => ~100/min theoretical max, 40 is plenty
  'devops:lookup':{ limit: 10,  windowMs: MINUTE },   // read-only external metadata lookup
  unknown:        { limit: 20,  windowMs: MINUTE },   // 404 probing / scanners
  global:         { limit: 240, windowMs: MINUTE },   // everything combined per client
};

export const DEFAULT_TTLS = {
  emptyWorkspaceMs: 10_000,     // nobody has created the workspace yet
  invalidSessionMs: 5 * MINUTE, // a cookie that failed verification stays invalid
  blockedLoginMs: 15 * MINUTE,  // mirrors the DB login window
  wrongPasswordMs: 15 * MINUTE, // fingerprint of a rejected password
  databaseDownMs: 5_000,        // circuit breaker when Neon is unreachable
  readCacheMs: 5_000,           // snapshot micro-cache
  unknownRouteMs: 10 * MINUTE,
};

export function readGuardConfig(env = {}) {
  const number = (name, fallback) => {
    const value = Number(env[name]);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  };
  const policies = {};
  for (const [name, policy] of Object.entries(DEFAULT_POLICIES)) {
    const envName = `RATE_LIMIT_${name.toUpperCase().replace(/[^A-Z]/g, '_')}_PER_MINUTE`;
    policies[name] = { ...policy, limit: number(envName, policy.limit) };
  }
  return {
    enabled: env.REQUEST_GUARD_DISABLED !== '1',
    policies,
    ttls: { ...DEFAULT_TTLS, readCacheMs: number('WORKSPACE_READ_CACHE_MS', DEFAULT_TTLS.readCacheMs) },
  };
}

export function createRequestGuard(options = {}) {
  const config = { ...readGuardConfig(options.env), ...options };
  const limiter = new RateLimiter();
  const negative = new NegativeCache({ defaultTtlMs: 30_000 });
  const rejectedPasswords = new BloomFilter({ expectedItems: 50_000, falsePositiveRate: 0.001 });
  const readCache = new ReadCache({ ttlMs: config.ttls.readCacheMs });
  const flights = new SingleFlight();

  return {
    config, limiter, negative, rejectedPasswords, readCache, flights,

    /** Apply route + global limits; returns the most restrictive verdict. */
    rateLimit(clientKey, routeClass, now = Date.now()) {
      if (!config.enabled) return { allowed: true, limit: Infinity, remaining: Infinity, retryAfterSeconds: 0, resetSeconds: 0 };
      const route = limiter.consume(`${routeClass}:${clientKey}`, config.policies[routeClass] ?? config.policies.unknown, now);
      if (!route.allowed) return route;
      const global = limiter.consume(`global:${clientKey}`, config.policies.global, now);
      return global.allowed ? route : global;
    },

    // --- negative cache helpers -------------------------------------------
    isUnknownRoute: (path, now) => negative.has(`route:${path}`, now),
    rememberUnknownRoute: (path, now) => negative.remember(`route:${path}`, true, config.ttls.unknownRouteMs, now),

    isInvalidSession: (cookieFingerprint, now) => negative.has(`session:${cookieFingerprint}`, now),
    rememberInvalidSession: (cookieFingerprint, now) => negative.remember(`session:${cookieFingerprint}`, true, config.ttls.invalidSessionMs, now),

    isLoginBlocked: (clientKey, now = Date.now()) => negative.lookup(`login:${clientKey}`, now)?.expires,
    rememberLoginBlocked: (clientKey, now) => negative.remember(`login:${clientKey}`, true, config.ttls.blockedLoginMs, now),

    isEmptyWorkspace: (now) => negative.has('workspace:empty', now),
    rememberEmptyWorkspace: (now) => negative.remember('workspace:empty', true, config.ttls.emptyWorkspaceMs, now),
    forgetEmptyWorkspace: () => negative.forget('workspace:empty'),

    databaseDownUntil: (now = Date.now()) => negative.lookup('database:down', now)?.expires,
    rememberDatabaseDown: (now) => negative.remember('database:down', true, config.ttls.databaseDownMs, now),
    forgetDatabaseDown: () => negative.forget('database:down'),

    /**
     * Bloom-filtered rejected password fingerprints. A hit only means "we have
     * probably rejected this exact guess before" – the caller must still run the
     * real constant-time comparison, so a false positive can never lock out the
     * correct password. It just lets repeated wrong guesses skip the DB write.
     */
    hasRejectedPassword: (fingerprint) => rejectedPasswords.has(fingerprint),
    rememberRejectedPassword: (fingerprint) => rejectedPasswords.add(fingerprint),

    /** Coalesced, micro-cached workspace read. */
    async readWorkspace(load, now = Date.now()) {
      const cached = readCache.get(now);
      if (cached) return cached;
      return flights.run('workspace:read', async () => {
        const fresh = readCache.get(Date.now());
        if (fresh) return fresh;
        const snapshot = await load();
        return readCache.set(snapshot);
      });
    },

    /** Called after a successful save so the next read is served from memory. */
    primeWorkspace(snapshot) { negative.forget('workspace:empty'); return readCache.set(snapshot); },
    invalidateWorkspace() { readCache.invalidate(); },

    snapshotStats() {
      return {
        negativeCache: { ...negative.stats, entries: negative.store.size },
        readCache: { ...readCache.stats },
        rejectedPasswordFilter: { count: rejectedPasswords.count, bits: rejectedPasswords.size, hashes: rejectedPasswords.hashes },
      };
    },
  };
}
