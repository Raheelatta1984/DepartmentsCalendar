/**
 * Logical Sharding and Machine Mapping for Image Storage
 * 
 * This module provides:
 * 1. Logical sharding strategy for distributing images across storage nodes
 * 2. Machine mapping for tracking which shard resides on which physical machine
 * 3. Consistent hashing for shard assignment
 * 4. Shard rebalancing utilities
 */

import { createHash } from 'node:crypto';

// Shard configuration
export const SHARD_CONFIG = {
  // Number of logical shards (should be power of 2 for consistent hashing)
  // 8192 shards allows for fine-grained distribution
  totalShards: 8192,
  
  // Number of virtual nodes per physical machine (for better distribution)
  virtualNodes: 160,
  
  // Replication factor (how many copies of each shard)
  replicationFactor: 3,
  
  // Shard key prefix
  keyPrefix: 'img:',
  
  // Machine metadata
  machineDefaults: {
    region: 'primary',
    zone: 'default',
    capacity: 100,      // Relative capacity weight
    status: 'active',   // 'active', 'draining', 'maintenance', 'offline'
    tags: {},
  },
};

/**
 * Consistent Hash Ring for shard distribution
 */
export class ConsistentHashRing {
  constructor(nodes = [], virtualNodes = SHARD_CONFIG.virtualNodes) {
    this.virtualNodes = virtualNodes;
    this.ring = new Map(); // hash -> nodeId
    this.sortedHashes = []; // Sorted array of hashes
    this.nodes = new Map(); // nodeId -> node info
    
    nodes.forEach(node => this.addNode(node));
  }

  /**
   * Generate hash for a key
   * @param {string} key - Key to hash
   * @returns {number} 32-bit hash
   */
  _hash(key) {
    // Use first 8 bytes of SHA-256 as 64-bit integer, then take lower 32 bits
    const hash = createHash('sha256').update(key).digest();
    return hash.readUInt32BE(0);
  }

  /**
   * Add a node to the ring
   * @param {Object} node - Node info { id, weight, ...metadata }
   */
  addNode(node) {
    const nodeId = node.id;
    const weight = node.weight || 1;
    const vNodes = Math.floor(this.virtualNodes * weight);
    
    this.nodes.set(nodeId, { ...node, virtualNodes: vNodes });
    
    for (let i = 0; i < vNodes; i++) {
      const hash = this._hash(`${nodeId}:vn${i}`);
      this.ring.set(hash, nodeId);
    }
    
    this._rebuildSortedHashes();
  }

  /**
   * Remove a node from the ring
   * @param {string} nodeId - Node ID to remove
   */
  removeNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    
    for (let i = 0; i < node.virtualNodes; i++) {
      const hash = this._hash(`${nodeId}:vn${i}`);
      this.ring.delete(hash);
    }
    
    this.nodes.delete(nodeId);
    this._rebuildSortedHashes();
  }

  /**
   * Update node weight
   * @param {string} nodeId - Node ID
   * @param {number} weight - New weight
   */
  updateNodeWeight(nodeId, weight) {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    
    this.removeNode(nodeId);
    this.addNode({ ...node, weight });
  }

  _rebuildSortedHashes() {
    this.sortedHashes = Array.from(this.ring.keys()).sort((a, b) => a - b);
  }

  /**
   * Get node for a key
   * @param {string} key - Key to locate
   * @returns {string|null} Node ID or null if ring is empty
   */
  getNode(key) {
    if (this.sortedHashes.length === 0) return null;
    
    const hash = this._hash(key);
    
    // Binary search for the first hash >= key hash
    let left = 0;
    let right = this.sortedHashes.length - 1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (this.sortedHashes[mid] < hash) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    
    // Wrap around to first hash if we're past the end
    const index = left % this.sortedHashes.length;
    return this.ring.get(this.sortedHashes[index]);
  }

  /**
   * Get N nodes for replication
   * @param {string} key - Key to locate
   * @param {number} count - Number of replicas
   * @returns {string[]} Array of node IDs
   */
  getReplicas(key, count = SHARD_CONFIG.replicationFactor) {
    if (this.sortedHashes.length === 0) return [];
    
    const hash = this._hash(key);
    const results = [];
    const seen = new Set();
    
    let left = 0;
    let right = this.sortedHashes.length - 1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (this.sortedHashes[mid] < hash) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    
    let index = left % this.sortedHashes.length;
    
    while (results.length < count && results.length < this.nodes.size) {
      const nodeId = this.ring.get(this.sortedHashes[index]);
      if (nodeId && !seen.has(nodeId)) {
        seen.add(nodeId);
        results.push(nodeId);
      }
      index = (index + 1) % this.sortedHashes.length;
    }
    
    return results;
  }

  /**
   * Get all nodes in the ring
   * @returns {Object[]} Array of node info
   */
  getAllNodes() {
    return Array.from(this.nodes.values());
  }

  /**
   * Get ring statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const distribution = new Map();
    for (const nodeId of this.ring.values()) {
      distribution.set(nodeId, (distribution.get(nodeId) || 0) + 1);
    }
    
    return {
      totalNodes: this.nodes.size,
      totalVirtualNodes: this.ring.size,
      avgVirtualNodesPerNode: this.nodes.size > 0 
        ? this.ring.size / this.nodes.size 
        : 0,
      distribution: Object.fromEntries(distribution),
    };
  }
}

/**
 * Shard Manager - handles logical shards and machine mapping
 */
export class ShardManager {
  constructor(options = {}) {
    this.config = { ...SHARD_CONFIG, ...options };
    this.hashRing = new ConsistentHashRing([], this.config.virtualNodes);
    this.shardMap = new Map(); // shardId -> { primary, replicas, machineMap }
    this.machineMap = new Map(); // machineId -> { shards, capacity, status, ... }
    this.shardToMachine = new Map(); // shardId -> machineId (primary)
  }

  /**
   * Register a machine in the cluster
   * @param {Object} machine - Machine info
   * @returns {string} Machine ID
   */
  registerMachine(machine) {
    const machineId = machine.id || `machine-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const machineInfo = {
      ...this.config.machineDefaults,
      ...machine,
      id: machineId,
      registeredAt: Date.now(),
      shards: [],
    };
    
    this.machineMap.set(machineId, machineInfo);
    
    // Add to hash ring with capacity as weight
    this.hashRing.addNode({
      id: machineId,
      weight: machineInfo.capacity,
      ...machineInfo,
    });
    
    return machineId;
  }

  /**
   * Unregister a machine (drain shards first)
   * @param {string} machineId - Machine ID
   * @param {boolean} force - Force removal without draining
   */
  async unregisterMachine(machineId, force = false) {
    const machine = this.machineMap.get(machineId);
    if (!machine) return;
    
    if (!force && machine.shards.length > 0) {
      throw new Error(`Machine ${machineId} has ${machine.shards.length} shards. Drain first or use force=true.`);
    }
    
    // Update machine status
    machine.status = 'offline';
    
    // Remove from hash ring
    this.hashRing.removeNode(machineId);
    this.machineMap.delete(machineId);
  }

  /**
   * Drain a machine (move shards to other machines)
   * @param {string} machineId - Machine ID
   * @returns {Object} Drain result
   */
  async drainMachine(machineId) {
    const machine = this.machineMap.get(machineId);
    if (!machine) throw new Error(`Machine ${machineId} not found`);
    
    machine.status = 'draining';
    const movedShards = [];
    
    for (const shardId of machine.shards) {
      const newMachineId = await this._reassignShard(shardId, machineId);
      if (newMachineId) {
        movedShards.push({ shardId, from: machineId, to: newMachineId });
      }
    }
    
    machine.status = 'drained';
    return { machineId, movedShards, shardsRemaining: machine.shards.length };
  }

  /**
   * Get or create shard assignment for a key
   * @param {string} key - Image key
   * @returns {Object} Shard assignment
   */
  getShardAssignment(key) {
    const shardId = this._keyToShard(key);
    let assignment = this.shardMap.get(shardId);
    
    if (!assignment) {
      assignment = this._createShardAssignment(shardId);
      this.shardMap.set(shardId, assignment);
    }
    
    return assignment;
  }

  /**
   * Convert key to shard ID
   * @param {string} key - Image key
   * @returns {number} Shard ID (0 to totalShards-1)
   */
  _keyToShard(key) {
    const hash = createHash('sha256').update(`${this.config.keyPrefix}${key}`).digest();
    const hashInt = hash.readUInt32BE(0);
    return hashInt % this.config.totalShards;
  }

  /**
   * Create shard assignment with replication
   * @param {number} shardId - Shard ID
   * @returns {Object} Shard assignment
   */
  _createShardAssignment(shardId) {
    const shardKey = `shard:${shardId}`;
    const replicas = this.hashRing.getReplicas(shardKey, this.config.replicationFactor);
    
    if (replicas.length === 0) {
      throw new Error('No machines available for shard assignment');
    }
    
    const [primary, ...replicaMachines] = replicas;
    
    // Update machine shard lists
    for (const machineId of replicas) {
      const machine = this.machineMap.get(machineId);
      if (machine && !machine.shards.includes(shardId)) {
        machine.shards.push(shardId);
      }
    }
    
    this.shardToMachine.set(shardId, primary);
    
    return {
      shardId,
      primary,
      replicas: replicaMachines,
      machineMap: {
        primary: this.machineMap.get(primary),
        replicas: replicaMachines.map(id => this.machineMap.get(id)).filter(Boolean),
      },
      createdAt: Date.now(),
    };
  }

  /**
   * Reassign a shard to a new machine
   * @param {number} shardId - Shard ID
   * @param {string} excludeMachineId - Machine to exclude
   * @returns {string|null} New machine ID
   */
  async _reassignShard(shardId, excludeMachineId) {
    const assignment = this.shardMap.get(shardId);
    if (!assignment) return null;
    
    // Find next healthy replica that's not the excluded machine
    for (const replicaId of assignment.replicas) {
      if (replicaId !== excludeMachineId) {
        const machine = this.machineMap.get(replicaId);
        if (machine && machine.status === 'active') {
          // Promote replica to primary
          assignment.primary = replicaId;
          assignment.replicas = assignment.replicas.filter(id => id !== replicaId);
          
          // Add excluded machine back as replica if it's still healthy
          const excludedMachine = this.machineMap.get(excludeMachineId);
          if (excludedMachine && excludedMachine.status === 'active') {
            assignment.replicas.push(excludeMachineId);
          }
          
          this.shardToMachine.set(shardId, replicaId);
          
          // Update machine shard lists
          if (machine) machine.shards.push(shardId);
          if (excludedMachine) {
            excludedMachine.shards = excludedMachine.shards.filter(id => id !== shardId);
          }
          
          return replicaId;
        }
      }
    }
    
    // No healthy replica, find any active machine
    for (const [machineId, machine] of this.machineMap) {
      if (machineId !== excludeMachineId && machine.status === 'active') {
        assignment.primary = machineId;
        assignment.replicas = [excludeMachineId, ...assignment.replicas.filter(id => id !== machineId)];
        this.shardToMachine.set(shardId, machineId);
        
        machine.shards.push(shardId);
        const excludedMachine = this.machineMap.get(excludeMachineId);
        if (excludedMachine) {
          excludedMachine.shards = excludedMachine.shards.filter(id => id !== shardId);
        }
        
        return machineId;
      }
    }
    
    return null;
  }

  /**
   * Get machine for a shard (primary)
   * @param {number} shardId - Shard ID
   * @returns {string|null} Machine ID
   */
  getMachineForShard(shardId) {
    return this.shardToMachine.get(shardId) || null;
  }

  /**
   * Get machine for a key
   * @param {string} key - Image key
   * @returns {string|null} Machine ID
   */
  getMachineForKey(key) {
    const shardId = this._keyToShard(key);
    return this.getMachineForShard(shardId);
  }

  /**
   * Get all shards for a machine
   * @param {string} machineId - Machine ID
   * @returns {number[]} Shard IDs
   */
  getShardsForMachine(machineId) {
    const machine = this.machineMap.get(machineId);
    return machine ? [...machine.shards] : [];
  }

  /**
   * Rebalance shards across machines
   * @param {Object} options - Rebalance options
   * @returns {Object} Rebalance result
   */
  async rebalance(options = {}) {
    const { maxMoves = 100, threshold = 0.15 } = options; // threshold = 15% imbalance
    const moves = [];
    
    const stats = this.hashRing.getStats();
    const avgShardsPerMachine = this.config.totalShards / this.hashRing.nodes.size;
    const maxAllowed = avgShardsPerMachine * (1 + threshold);
    const minAllowed = avgShardsPerMachine * (1 - threshold);
    
    // Find overloaded and underloaded machines
    const overloaded = [];
    const underloaded = [];
    
    for (const [machineId, machine] of this.machineMap) {
      if (machine.status !== 'active') continue;
      const shardCount = machine.shards.length;
      if (shardCount > maxAllowed) overloaded.push({ machineId, shardCount });
      else if (shardCount < minAllowed) underloaded.push({ machineId, shardCount });
    }
    
    // Move shards from overloaded to underloaded
    for (const { machineId: fromId, shardCount: fromCount } of overloaded) {
      if (moves.length >= maxMoves) break;
      
      const fromMachine = this.machineMap.get(fromId);
      const shardsToMove = Math.min(
        fromCount - maxAllowed,
        maxMoves - moves.length
      );
      
      for (const shardId of fromMachine.shards.slice(0, shardsToMove)) {
        if (underloaded.length === 0) break;
        
        // Find best underloaded machine
        underloaded.sort((a, b) => a.shardCount - b.shardCount);
        const toMachine = underloaded[0];
        
        // Reassign shard
        await this._reassignShard(shardId, fromId);
        moves.push({ shardId, from: fromId, to: toMachine.machineId });
        
        toMachine.shardCount++;
        if (toMachine.shardCount >= minAllowed) {
          underloaded.shift();
        }
      }
    }
    
    return { moves, stats: this.getClusterStats() };
  }

  /**
   * Get cluster statistics
   * @returns {Object} Cluster stats
   */
  getClusterStats() {
    const machines = Array.from(this.machineMap.values());
    const activeMachines = machines.filter(m => m.status === 'active');
    const shardCounts = activeMachines.map(m => m.shards.length);
    
    return {
      totalMachines: machines.length,
      activeMachines: activeMachines.length,
      totalShards: this.config.totalShards,
      assignedShards: this.shardMap.size,
      replicationFactor: this.config.replicationFactor,
      shardDistribution: {
        min: Math.min(...shardCounts, 0),
        max: Math.max(...shardCounts, 0),
        avg: shardCounts.length > 0 
          ? shardCounts.reduce((a, b) => a + b, 0) / shardCounts.length 
          : 0,
      },
      machines: machines.map(m => ({
        id: m.id,
        status: m.status,
        region: m.region,
        zone: m.zone,
        capacity: m.capacity,
        shardCount: m.shards.length,
        registeredAt: m.registeredAt,
      })),
      hashRing: this.hashRing.getStats(),
    };
  }

  /**
   * Generate shard map export for persistence
   * @returns {Object} Serializable shard map
   */
  exportShardMap() {
    return {
      config: this.config,
      shardMap: Object.fromEntries(this.shardMap),
      machineMap: Object.fromEntries(this.machineMap),
      shardToMachine: Object.fromEntries(this.shardToMachine),
      hashRing: {
        nodes: Array.from(this.hashRing.nodes.entries()),
        virtualNodes: this.hashRing.virtualNodes,
      },
      exportedAt: Date.now(),
    };
  }

  /**
   * Import shard map from persisted state
   * @param {Object} data - Exported shard map
   */
  importShardMap(data) {
    if (data.config) this.config = { ...this.config, ...data.config };
    
    if (data.shardMap) {
      this.shardMap = new Map(Object.entries(data.shardMap));
    }
    
    if (data.machineMap) {
      this.machineMap = new Map(Object.entries(data.machineMap));
    }
    
    if (data.shardToMachine) {
      this.shardToMachine = new Map(Object.entries(data.shardToMachine));
    }
    
    if (data.hashRing) {
      this.hashRing = new ConsistentHashRing([], data.hashRing.virtualNodes);
      for (const [nodeId, nodeInfo] of data.hashRing.nodes) {
        this.hashRing.nodes.set(nodeId, nodeInfo);
        for (let i = 0; i < nodeInfo.virtualNodes; i++) {
          const hash = this.hashRing._hash(`${nodeId}:vn${i}`);
          this.hashRing.ring.set(hash, nodeId);
        }
      }
      this.hashRing._rebuildSortedHashes();
    }
  }
}

/**
 * Image key generator with shard awareness
 */
export class ImageKeyGenerator {
  constructor(shardManager, options = {}) {
    this.shardManager = shardManager;
    this.prefix = options.prefix || 'img';
  }

  /**
   * Generate a sharded key for an image
   * @param {Object} metadata - Image metadata
   * @returns {Object} Key info with shard assignment
   */
  generateKey(metadata) {
    const { entityId, departmentId, employeeId, type = 'general', filename } = metadata;
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    
    // Build hierarchical key
    const parts = [this.prefix];
    if (entityId) parts.push(`ent:${entityId}`);
    if (departmentId) parts.push(`dept:${departmentId}`);
    if (employeeId) parts.push(`emp:${employeeId}`);
    parts.push(type);
    parts.push(`${timestamp}-${random}-${filename}`);
    
    const key = parts.join('/');
    const assignment = this.shardManager.getShardAssignment(key);
    
    return {
      key,
      shardId: assignment.shardId,
      primaryMachine: assignment.primary,
      replicaMachines: assignment.replicas,
      metadata,
    };
  }

  /**
   * Parse key to extract metadata
   * @param {string} key - Image key
   * @returns {Object} Parsed metadata
   */
  parseKey(key) {
    const parts = key.split('/');
    const metadata = { type: 'general' };
    
    for (const part of parts.slice(1)) { // Skip prefix
      if (part.startsWith('ent:')) metadata.entityId = part.slice(4);
      else if (part.startsWith('dept:')) metadata.departmentId = part.slice(5);
      else if (part.startsWith('emp:')) metadata.employeeId = part.slice(4);
      else if (!part.includes('-') || part.includes('.')) {
        metadata.filename = part;
      } else {
        metadata.type = part;
      }
    }
    
    return metadata;
  }
}

export default {
  ConsistentHashRing,
  ShardManager,
  ImageKeyGenerator,
  SHARD_CONFIG,
};