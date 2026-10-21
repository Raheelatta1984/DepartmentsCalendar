/**
 * 64-bit ID Generator (NextID)
 * 
 * Bit layout (64 bits total):
 * - Bits 63-23 (41 bits): Timestamp in milliseconds since custom epoch
 * - Bits 22-10 (13 bits): Shard reference number (0-8191)
 * - Bits 9-0 (10 bits): Sequence counter (0-1023) with sort order
 * 
 * This provides:
 * - ~69 years of timestamps (41 bits = 2^41 ms ≈ 69.7 years)
 * - 8192 shards (13 bits)
 * - 1024 sequences per millisecond per shard (10 bits)
 * - Natural sortability by timestamp
 * - Shard affinity for distributed systems
 */

import { createHash } from 'node:crypto';

// Custom epoch: 2024-01-01 00:00:00 UTC (milliseconds)
export const CUSTOM_EPOCH = 1704067200000;

// Bit allocation
export const ID_BITS = {
  TIMESTAMP: 41,
  SHARD: 13,
  COUNTER: 10,
};

// Bit masks (as BigInt for 64-bit operations)
export const ID_MASKS = {
  TIMESTAMP: (1n << 41n) - 1n,        // 0x1FFFFFFFFFF
  SHARD: (1n << 13n) - 1n,            // 0x1FFF
  COUNTER: (1n << 10n) - 1n,          // 0x3FF
};

// Bit masks (as Number for 32-bit operations like sequence)
export const ID_MASKS_NUM = {
  TIMESTAMP: (1 << 41) - 1,   // Not used directly
  SHARD: (1 << 13) - 1,       // 8191
  COUNTER: (1 << 10) - 1,     // 1023
};

// Bit shifts
export const ID_SHIFTS = {
  SHARD: 10n,        // Counter bits
  TIMESTAMP: 23n,    // Counter + Shard bits (10 + 13)
};

// Maximum values
export const ID_MAX = {
  TIMESTAMP: (1 << 41) - 1,   // ~69 years
  SHARD: (1 << 13) - 1,       // 8191
  COUNTER: (1 << 10) - 1,     // 1023
};

/**
 * NextID Generator Class
 * Thread-safe ID generation with clock drift protection
 */
export class NextIDGenerator {
  constructor(options = {}) {
    this.epoch = options.epoch || CUSTOM_EPOCH;
    this.shardId = options.shardId || 0;
    this.maxShardId = ID_MAX.SHARD;
    
    // Sequence state (use Number for sequence operations)
    this.lastTimestamp = -1;
    this.sequence = 0;
    this.sequenceMask = ID_MASKS_NUM.COUNTER;
    
    // Clock drift protection
    this.maxDriftMs = options.maxDriftMs || 1000; // Max 1 second drift
    this.lastRealTime = Date.now();
    
    // Statistics
    this.stats = {
      generated: 0,
      collisions: 0,
      driftCorrections: 0,
      maxSequenceReached: 0,
    };
    
    // Validate shard ID
    if (this.shardId < 0 || this.shardId > this.maxShardId) {
      throw new Error(`Shard ID must be between 0 and ${this.maxShardId}`);
    }
  }

  /**
   * Generate next ID
   * @param {Object} options - Generation options
   * @returns {bigint} 64-bit ID
   */
  nextId(options = {}) {
    const { 
      shardId = this.shardId,
      timestamp = Date.now(),
      forceTimestamp = false 
    } = options;
    
    // Validate shard ID
    if (shardId < 0 || shardId > this.maxShardId) {
      throw new Error(`Shard ID must be between 0 and ${this.maxShardId}`);
    }
    
    let currentTimestamp = timestamp - this.epoch;
    
    // Handle clock drift
    if (currentTimestamp < this.lastTimestamp) {
      const drift = this.lastTimestamp - currentTimestamp;
      if (drift > this.maxDriftMs) {
        throw new Error(`Clock drift detected: ${drift}ms. Cannot generate IDs.`);
      }
      // Wait for clock to catch up
      currentTimestamp = this.lastTimestamp;
      this.stats.driftCorrections++;
    }
    
    // Handle sequence within same millisecond
    if (currentTimestamp === this.lastTimestamp) {
      this.sequence = (this.sequence + 1) & this.sequenceMask;
      
      // Sequence exhausted, wait for next millisecond
      if (this.sequence === 0) {
        currentTimestamp = this._waitForNextMillis(this.lastTimestamp);
        this.stats.maxSequenceReached++;
      }
    } else {
      // New millisecond, reset sequence
      this.sequence = 0;
    }
    
    this.lastTimestamp = currentTimestamp;
    this.stats.generated++;
    
    // Build the 64-bit ID
    const timestampBits = BigInt(currentTimestamp) & ID_MASKS.TIMESTAMP;
    const shardBits = BigInt(shardId) & ID_MASKS.SHARD;
    const counterBits = BigInt(this.sequence) & ID_MASKS.COUNTER;
    
    const id = (timestampBits << ID_SHIFTS.TIMESTAMP) |
               (shardBits << ID_SHIFTS.SHARD) |
               counterBits;
    
    return id;
  }

  /**
   * Wait for next millisecond
   * @param {number} lastTimestamp - Last timestamp
   * @returns {number} New timestamp
   */
  _waitForNextMillis(lastTimestamp) {
    let timestamp = Date.now() - this.epoch;
    while (timestamp <= lastTimestamp) {
      // Busy wait (in production, consider using setImmediate or similar)
      timestamp = Date.now() - this.epoch;
    }
    return timestamp;
  }

  /**
   * Generate multiple IDs efficiently
   * @param {number} count - Number of IDs to generate
   * @param {Object} options - Generation options
   * @returns {bigint[]} Array of IDs
   */
  nextIds(count, options = {}) {
    if (count <= 0) return [];
    if (count > 10000) throw new Error('Batch size too large (max 10000)');
    
    const ids = new Array(count);
    for (let i = 0; i < count; i++) {
      ids[i] = this.nextId(options);
    }
    return ids;
  }

  /**
   * Parse an ID into its components
   * @param {bigint|string|number} id - ID to parse
   * @returns {Object} Parsed components
   */
  parseId(id) {
    const idBigInt = typeof id === 'bigint' ? id : BigInt(id);
    
    const counter = Number(idBigInt & ID_MASKS.COUNTER);
    const shard = Number((idBigInt >> ID_SHIFTS.SHARD) & ID_MASKS.SHARD);
    const timestamp = Number((idBigInt >> ID_SHIFTS.TIMESTAMP) & ID_MASKS.TIMESTAMP);
    const generatedAt = timestamp + this.epoch;
    
    return {
      id: idBigInt,
      idString: idBigInt.toString(),
      idHex: '0x' + idBigInt.toString(16).padStart(16, '0'),
      timestamp,
      generatedAt,
      generatedAtISO: new Date(generatedAt).toISOString(),
      shard,
      counter,
      // Binary representation for debugging
      binary: idBigInt.toString(2).padStart(64, '0'),
    };
  }

  /**
   * Extract timestamp from ID
   * @param {bigint|string|number} id - ID
   * @returns {Date} Generation date
   */
  getTimestamp(id) {
    const idBigInt = typeof id === 'bigint' ? id : BigInt(id);
    const timestamp = Number((idBigInt >> ID_SHIFTS.TIMESTAMP) & ID_MASKS.TIMESTAMP);
    return new Date(timestamp + this.epoch);
  }

  /**
   * Extract shard from ID
   * @param {bigint|string|number} id - ID
   * @returns {number} Shard ID
   */
  getShard(id) {
    const idBigInt = typeof id === 'bigint' ? id : BigInt(id);
    return Number((idBigInt >> ID_SHIFTS.SHARD) & ID_MASKS.SHARD);
  }

  /**
   * Extract counter from ID
   * @param {bigint|string|number} id - ID
   * @returns {number} Counter value
   */
  getCounter(id) {
    const idBigInt = typeof id === 'bigint' ? id : BigInt(id);
    return Number(idBigInt & ID_MASKS.COUNTER);
  }

  /**
   * Compare two IDs (for sorting)
   * @param {bigint|string|number} a - First ID
   * @param {bigint|string|number} b - Second ID
   * @returns {number} -1, 0, or 1
   */
  compare(a, b) {
    const aBigInt = typeof a === 'bigint' ? a : BigInt(a);
    const bBigInt = typeof b === 'bigint' ? b : BigInt(b);
    return aBigInt < bBigInt ? -1 : aBigInt > bBigInt ? 1 : 0;
  }

  /**
   * Check if ID is valid format
   * @param {bigint|string|number} id - ID to validate
   * @returns {boolean} True if valid
   */
  isValid(id) {
    try {
      const idBigInt = typeof id === 'bigint' ? id : BigInt(id);
      // Check it fits in 64 bits
      return idBigInt >= 0n && idBigInt < (1n << 64n);
    } catch {
      return false;
    }
  }

  /**
   * Get generator statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      generated: 0,
      collisions: 0,
      driftCorrections: 0,
      maxSequenceReached: 0,
    };
  }

  /**
   * Set shard ID (for dynamic shard assignment)
   * @param {number} shardId - New shard ID
   */
  setShardId(shardId) {
    if (shardId < 0 || shardId > this.maxShardId) {
      throw new Error(`Shard ID must be between 0 and ${this.maxShardId}`);
    }
    this.shardId = shardId;
  }
}

/**
 * Distributed ID Generator Coordinator
 * Manages multiple generators across shards/machines
 */
export class DistributedIDCoordinator {
  constructor(options = {}) {
    this.epoch = options.epoch || CUSTOM_EPOCH;
    this.generators = new Map(); // shardId -> NextIDGenerator
    this.defaultShardId = options.defaultShardId || 0;
    this.shardResolver = options.shardResolver || null; // Function(key) -> shardId
  }

  /**
   * Get or create generator for a shard
   * @param {number} shardId - Shard ID
   * @returns {NextIDGenerator} Generator instance
   */
  getGenerator(shardId) {
    if (!this.generators.has(shardId)) {
      this.generators.set(shardId, new NextIDGenerator({
        epoch: this.epoch,
        shardId,
      }));
    }
    return this.generators.get(shardId);
  }

  /**
   * Generate ID for a specific shard
   * @param {number} shardId - Shard ID
   * @param {Object} options - Generation options
   * @returns {bigint} Generated ID
   */
  nextId(shardId, options = {}) {
    const generator = this.getGenerator(shardId);
    return generator.nextId({ ...options, shardId });
  }

  /**
   * Generate ID with automatic shard resolution
   * @param {string} key - Key to resolve shard
   * @param {Object} options - Generation options
   * @returns {bigint} Generated ID
   */
  nextIdForKey(key, options = {}) {
    let shardId = this.defaultShardId;
    
    if (this.shardResolver) {
      shardId = this.shardResolver(key);
    } else {
      // Default: hash-based shard assignment
      const hash = createHash('sha256').update(key).digest();
      shardId = hash.readUInt16BE(0) % (ID_MAX.SHARD + 1);
    }
    
    return this.nextId(shardId, options);
  }

  /**
   * Parse ID using appropriate generator
   * @param {bigint|string|number} id - ID to parse
   * @returns {Object} Parsed components
   */
  parseId(id) {
    // Use default generator for parsing (epoch is same)
    const defaultGen = this.getGenerator(this.defaultShardId);
    return defaultGen.parseId(id);
  }

  /**
   * Extract shard from ID
   * @param {bigint|string|number} id - ID
   * @returns {number} Shard ID
   */
  getShard(id) {
    const defaultGen = this.getGenerator(this.defaultShardId);
    return defaultGen.getShard(id);
  }

  /**
   * Get all generator statistics
   * @returns {Object} Combined statistics
   */
  getStats() {
    const stats = {
      totalGenerated: 0,
      totalCollisions: 0,
      totalDriftCorrections: 0,
      totalMaxSequenceReached: 0,
      byShard: {},
    };
    
    for (const [shardId, generator] of this.generators) {
      const genStats = generator.getStats();
      stats.totalGenerated += genStats.generated;
      stats.totalCollisions += genStats.collisions;
      stats.totalDriftCorrections += genStats.driftCorrections;
      stats.totalMaxSequenceReached += genStats.maxSequenceReached;
      stats.byShard[shardId] = genStats;
    }
    
    return stats;
  }

  /**
   * Set shard resolver function
   * @param {Function} resolver - Function(key) -> shardId
   */
  setShardResolver(resolver) {
    this.shardResolver = resolver;
  }
}

/**
 * ID utilities for database integration
 */
export const IDUtils = {
  /**
   * Convert ID to database-friendly formats
   * @param {bigint} id - Generated ID
   * @returns {Object} Database formats
   */
  toDatabaseFormats(id) {
    const idBigInt = typeof id === 'bigint' ? id : BigInt(id);
    return {
      bigint: idBigInt,
      string: idBigInt.toString(),
      hex: '0x' + idBigInt.toString(16).padStart(16, '0'),
      // For databases that don't support unsigned 64-bit
      signedBigInt: idBigInt > (1n << 63n) - 1n ? idBigInt - (1n << 64n) : idBigInt,
      // Base64 URL-safe encoding (11 chars)
      base64url: this.toBase64Url(idBigInt),
      // UUID-like format for display (not a real UUID)
      display: this.toDisplayFormat(idBigInt),
    };
  },

  /**
   * Convert to base64url (compact representation)
   * @param {bigint} id - ID
   * @returns {string} Base64URL encoded
   */
  toBase64Url(id) {
    const idBigInt = typeof id === 'bigint' ? id : BigInt(id);
    const bytes = new ArrayBuffer(8);
    const view = new DataView(bytes);
    view.setBigUint64(0, idBigInt, false); // Big-endian
    const uint8 = new Uint8Array(bytes);
    return btoa(String.fromCharCode(...uint8))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  },

  /**
   * Convert from base64url
   * @param {string} encoded - Base64URL encoded ID
   * @returns {bigint} Decoded ID
   */
  fromBase64Url(encoded) {
    // Add padding if needed
    let padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (padded.length % 4) padded += '=';
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const view = new DataView(bytes.buffer);
    return view.getBigUint64(0, false);
  },

  /**
   * Convert to display format (human-readable)
   * @param {bigint} id - ID
   * @returns {string} Display format
   */
  toDisplayFormat(id) {
    const idBigInt = typeof id === 'bigint' ? id : BigInt(id);
    const hex = idBigInt.toString(16).padStart(16, '0');
    // Group as 4-4-4-4 for readability
    return hex.match(/.{1,4}/g).join('-').toUpperCase();
  },

  /**
   * Parse display format back to ID
   * @param {string} display - Display format
   * @returns {bigint} ID
   */
  fromDisplayFormat(display) {
    const hex = display.replace(/-/g, '').toLowerCase();
    return BigInt('0x' + hex);
  },

  /**
   * Generate sortable string ID (for database indexes)
   * @param {bigint} id - ID
   * @returns {string} Zero-padded string for lexical sorting
   */
  toSortableString(id) {
    const idBigInt = typeof id === 'bigint' ? id : BigInt(id);
    return idBigInt.toString().padStart(20, '0');
  },
};

/**
 * Factory function for creating ID generators
 */
export function createNextIDGenerator(options = {}) {
  return new NextIDGenerator(options);
}

export function createDistributedCoordinator(options = {}) {
  return new DistributedIDCoordinator(options);
}

// Default singleton for convenience
export const defaultGenerator = new NextIDGenerator();
export const defaultCoordinator = new DistributedIDCoordinator();

export default {
  NextIDGenerator,
  DistributedIDCoordinator,
  IDUtils,
  createNextIDGenerator,
  createDistributedCoordinator,
  defaultGenerator,
  defaultCoordinator,
  CUSTOM_EPOCH,
  ID_BITS,
  ID_MASKS,
  ID_SHIFTS,
  ID_MAX,
};