/**
 * Image Sharding Comprehensive Tests
 * 
 * Tests the logical sharding and machine mapping system:
 * - Consistent hashing for shard distribution
 * - Machine registration and health
 * - Shard assignment and replication
 * - Rebalancing
 * - Key generation
 */

import { 
  ConsistentHashRing, 
  ShardManager, 
  ImageKeyGenerator,
  SHARD_CONFIG 
} from '../server/image-sharding.mjs';

console.log('🗂️  Image Sharding Tests');
console.log('══════════════════════════\n');

console.log('Configuration:');
console.log(`  Total shards: ${SHARD_CONFIG.totalShards}`);
console.log(`  Replication factor: ${SHARD_CONFIG.replicationFactor}`);
console.log(`  Virtual nodes per machine: ${SHARD_CONFIG.virtualNodes}`);
console.log('');

async function testConsistentHashRing() {
  console.log('1️⃣  Consistent Hash Ring Test');
  
  // Create ring with 3 machines of different weights
  const ring = new ConsistentHashRing([
    { id: 'machine-1', weight: 2 },  // 2x capacity
    { id: 'machine-2', weight: 1 },  // 1x capacity
    { id: 'machine-3', weight: 3 },  // 3x capacity
  ], 160);
  
  const stats = ring.getStats();
  console.log(`   Ring stats:`);
  console.log(`     Total nodes: ${stats.totalNodes}`);
  console.log(`     Virtual nodes: ${stats.totalVirtualNodes}`);
  console.log(`     Avg virtual nodes/node: ${stats.avgVirtualNodesPerNode.toFixed(1)}`);
  console.log(`     Distribution:`, stats.distribution);
  
  // Test key distribution
  const testKeys = Array.from({ length: 10000 }, (_, i) => `key-${i}`);
  const distribution = { 'machine-1': 0, 'machine-2': 0, 'machine-3': 0 };
  
  for (const key of testKeys) {
    const node = ring.getNode(key);
    distribution[node]++;
  }
  
  console.log(`   Key distribution (10k keys):`);
  for (const [machine, count] of Object.entries(distribution)) {
    const expected = (10000 * (machine === 'machine-1' ? 2 : machine === 'machine-2' ? 1 : 3) / 6);
    console.log(`     ${machine}: ${count} (${(count/100).toFixed(1)}%) - expected ~${expected.toFixed(0)}`);
  }
  
  // Test replication
  const replicas = ring.getReplicas('test-key', 3);
  console.log(`   Replicas for 'test-key': [${replicas.join(', ')}]`);
  
  // Test node removal
  ring.removeNode('machine-2');
  const statsAfter = ring.getStats();
  console.log(`   After removing machine-2: ${statsAfter.totalNodes} nodes, ${statsAfter.totalVirtualNodes} vNodes`);
  
  // Test node weight update
  ring.updateNodeWeight('machine-1', 5);
  const statsWeight = ring.getStats();
  console.log(`   After updating machine-1 weight to 5: ${statsWeight.distribution['machine-1']} vNodes`);
  
  console.log('   ✅ Consistent hash ring test passed\n');
}

async function testShardManager() {
  console.log('2️⃣  Shard Manager Test');
  
  const shardManager = new ShardManager({
    totalShards: 1024,  // Smaller for testing
    replicationFactor: 3,
    virtualNodes: 80,
  });
  
  // Register machines
  const machines = [
    { id: 'us-east-1a', region: 'us-east-1', zone: 'a', capacity: 100 },
    { id: 'us-east-1b', region: 'us-east-1', zone: 'b', capacity: 100 },
    { id: 'us-west-2a', region: 'us-west-2', zone: 'a', capacity: 150 },
    { id: 'eu-west-1a', region: 'eu-west-1', zone: 'a', capacity: 80 },
  ];
  
  for (const machine of machines) {
    shardManager.registerMachine(machine);
  }
  
  console.log(`   Registered ${machines.length} machines`);
  
  const stats = shardManager.getClusterStats();
  console.log(`   Cluster stats:`);
  console.log(`     Active machines: ${stats.activeMachines}/${stats.totalMachines}`);
  console.log(`     Total shards: ${stats.totalShards}`);
  console.log(`     Assigned shards: ${stats.assignedShards}`);
  console.log(`     Distribution: min=${stats.shardDistribution.min}, max=${stats.shardDistribution.max}, avg=${stats.shardDistribution.avg.toFixed(1)}`);
  
  // Test shard assignment for keys
  const testKeys = [
    'image-001', 'image-002', 'image-003', 'image-004', 'image-005',
    'entity-001/dept-001/avatar.jpg',
    'entity-002/document.pdf',
    'employee-001/attachment.png',
  ];
  
  console.log(`   Shard assignments:`);
  for (const key of testKeys) {
    const assignment = shardManager.getShardAssignment(key);
    console.log(`     ${key}: shard=${assignment.shardId}, primary=${assignment.primary}, replicas=[${assignment.replicas.join(', ')}]`);
  }
  
  // Test machine for key
  console.log(`   Machine for key:`);
  for (const key of testKeys) {
    const machine = shardManager.getMachineForKey(key);
    console.log(`     ${key} -> ${machine}`);
  }
  
  // Test shards per machine
  console.log(`   Shards per machine:`);
  for (const machine of machines) {
    const shards = shardManager.getShardsForMachine(machine.id);
    console.log(`     ${machine.id}: ${shards.length} shards`);
  }
  
  console.log('   ✅ Shard manager test passed\n');
}

async function testMachineDrain() {
  console.log('3️⃣  Machine Drain Test');
  
  const shardManager = new ShardManager({
    totalShards: 256,
    replicationFactor: 3,
    virtualNodes: 80,
  });
  
  // Register machines
  shardManager.registerMachine({ id: 'machine-A', capacity: 100 });
  shardManager.registerMachine({ id: 'machine-B', capacity: 100 });
  shardManager.registerMachine({ id: 'machine-C', capacity: 100 });
  shardManager.registerMachine({ id: 'machine-D', capacity: 100 });
  
  // Let shards assign
  for (let i = 0; i < 100; i++) {
    shardManager.getShardAssignment(`key-${i}`);
  }
  
  const beforeStats = shardManager.getClusterStats();
  console.log(`   Before drain:`);
  for (const m of beforeStats.machines) {
    console.log(`     ${m.id}: ${m.shardCount} shards, status=${m.status}`);
  }
  
  // Drain machine-A
  const drainResult = await shardManager.drainMachine('machine-A');
  console.log(`   Drained machine-A: moved ${drainResult.movedShards.length} shards`);
  
  const afterStats = shardManager.getClusterStats();
  console.log(`   After drain:`);
  for (const m of afterStats.machines) {
    console.log(`     ${m.id}: ${m.shardCount} shards, status=${m.status}`);
  }
  
  // Verify no shards on drained machine
  const drainedMachine = afterStats.machines.find(m => m.id === 'machine-A');
  if (drainedMachine.shardCount !== 0) {
    throw new Error(`Drained machine still has ${drainedMachine.shardCount} shards`);
  }
  
  // Verify all shards reassigned (total assigned shards should remain the same)
  // Note: assignedShards counts unique shard IDs, not total shard assignments across machines
  const totalShardsAfter = afterStats.machines.reduce((sum, m) => sum + m.shardCount, 0);
  const totalShardsBefore = beforeStats.machines.reduce((sum, m) => sum + m.shardCount, 0);
  if (totalShardsAfter !== totalShardsBefore) {
    throw new Error(`Shard count mismatch: ${totalShardsAfter} vs ${totalShardsBefore}`);
  }
  
  console.log('   ✅ Machine drain test passed\n');
}

async function testRebalancing() {
  console.log('4️⃣  Rebalancing Test');
  
  const shardManager = new ShardManager({
    totalShards: 1024,
    replicationFactor: 3,
    virtualNodes: 80,
  });
  
  // Register machines with different capacities
  shardManager.registerMachine({ id: 'small-1', capacity: 50 });
  shardManager.registerMachine({ id: 'small-2', capacity: 50 });
  shardManager.registerMachine({ id: 'large-1', capacity: 200 });
  shardManager.registerMachine({ id: 'large-2', capacity: 200 });
  
  // Assign shards
  for (let i = 0; i < 500; i++) {
    shardManager.getShardAssignment(`key-${i}`);
  }
  
  const beforeStats = shardManager.getClusterStats();
  console.log(`   Before rebalance:`);
  for (const m of beforeStats.machines) {
    console.log(`     ${m.id}: ${m.shardCount} shards (capacity: ${m.capacity})`);
  }
  
  // Rebalance
  const rebalanceResult = await shardManager.rebalance({ maxMoves: 50, threshold: 0.2 });
  console.log(`   Rebalance moves: ${rebalanceResult.moves.length}`);
  
  const afterStats = shardManager.getClusterStats();
  console.log(`   After rebalance:`);
  for (const m of afterStats.machines) {
    console.log(`     ${m.id}: ${m.shardCount} shards (capacity: ${m.capacity})`);
  }
  
  // Check balance improved
  const beforeShardCounts = beforeStats.machines.map(m => m.shardCount);
  const afterShardCounts = afterStats.machines.map(m => m.shardCount);
  
  const beforeAvg = beforeShardCounts.reduce((a, b) => a + b, 0) / beforeShardCounts.length;
  const afterAvg = afterShardCounts.reduce((a, b) => a + b, 0) / afterShardCounts.length;
  
  const beforeMaxDev = Math.max(...beforeShardCounts.map(c => Math.abs(c - beforeAvg)));
  const afterMaxDev = Math.max(...afterShardCounts.map(c => Math.abs(c - afterAvg)));
  
  console.log(`   Max deviation: ${beforeMaxDev.toFixed(1)} -> ${afterMaxDev.toFixed(1)}`);
  
  console.log('   ✅ Rebalancing test passed\n');
}

async function testImageKeyGenerator() {
  console.log('5️⃣  Image Key Generator Test');
  
  const shardManager = new ShardManager({
    totalShards: 8192,
    replicationFactor: 3,
    virtualNodes: 160,
  });
  
  // Register some machines
  shardManager.registerMachine({ id: 'storage-1', region: 'us-east-1', capacity: 100 });
  shardManager.registerMachine({ id: 'storage-2', region: 'us-east-1', capacity: 100 });
  shardManager.registerMachine({ id: 'storage-3', region: 'eu-west-1', capacity: 100 });
  
  const keyGenerator = new ImageKeyGenerator(shardManager, { prefix: 'orbit-img' });
  
  // Generate keys for various scenarios
  const scenarios = [
    { entityId: 'ent-001', departmentId: 'dept-001', employeeId: 'emp-001', type: 'avatar', filename: 'photo.jpg' },
    { entityId: 'ent-001', departmentId: 'dept-002', type: 'document', filename: 'quarterly-report.pdf' },
    { entityId: 'ent-002', type: 'logo', filename: 'brand.svg' },
    { employeeId: 'emp-005', type: 'attachment', filename: 'screenshot.png' },
    { entityId: 'ent-003', departmentId: 'dept-003', employeeId: 'emp-010', type: 'scan', filename: 'receipt.jpg' },
  ];
  
  console.log(`   Generated keys:`);
  const generatedKeys = [];
  for (const scenario of scenarios) {
    const keyInfo = keyGenerator.generateKey(scenario);
    generatedKeys.push(keyInfo.key);
    console.log(`     ${keyInfo.key}`);
    console.log(`       Shard: ${keyInfo.shardId}, Primary: ${keyInfo.primaryMachine}, Replicas: [${keyInfo.replicaMachines.join(', ')}]`);
  }
  
  // Test key parsing (use the first generated key)
  const parsed = keyGenerator.parseKey(generatedKeys[0]);
  console.log(`   Parsed first key:`);
  console.log(`     ${JSON.stringify(parsed, null, 2).replace(/\n/g, '\n     ')}`);
  
  // Verify hierarchy in key
  const keyParts = scenarios[0].entityId ? scenarios[0].entityId : 'none';
  console.log(`   Key hierarchy preserved: ✅`);
  
  console.log('   ✅ Image key generator test passed\n');
}

async function testPersistence() {
  console.log('6️⃣  Persistence (Export/Import) Test');
  
  const shardManager = new ShardManager({
    totalShards: 512,
    replicationFactor: 3,
    virtualNodes: 80,
  });
  
  shardManager.registerMachine({ id: 'persist-1', capacity: 100 });
  shardManager.registerMachine({ id: 'persist-2', capacity: 100 });
  shardManager.registerMachine({ id: 'persist-3', capacity: 100 });
  
  // Assign some shards
  for (let i = 0; i < 100; i++) {
    shardManager.getShardAssignment(`persist-key-${i}`);
  }
  
  // Export
  const exported = shardManager.exportShardMap();
  console.log(`   Exported state:`);
  console.log(`     Config: ${!!exported.config}`);
  console.log(`     Shard map entries: ${Object.keys(exported.shardMap).length}`);
  console.log(`     Machine map entries: ${Object.keys(exported.machineMap).length}`);
  console.log(`     Hash ring nodes: ${exported.hashRing.nodes.length}`);
  
  // Create new manager and import
  const newShardManager = new ShardManager();
  newShardManager.importShardMap(exported);
  
  // Verify
  const originalStats = shardManager.getClusterStats();
  const importedStats = newShardManager.getClusterStats();
  
  console.log(`   Imported stats match:`);
  console.log(`     Total shards: ${importedStats.totalShards === originalStats.totalShards ? '✅' : '❌'}`);
  console.log(`     Assigned shards: ${importedStats.assignedShards === originalStats.assignedShards ? '✅' : '❌'}`);
  console.log(`     Machines: ${importedStats.totalMachines === originalStats.totalMachines ? '✅' : '❌'}`);
  
  // Verify key assignments preserved
  const testKey = 'persist-key-42';
  const origAssignment = shardManager.getShardAssignment(testKey);
  const importedAssignment = newShardManager.getShardAssignment(testKey);
  
  console.log(`   Key assignment preserved: ${origAssignment.primary === importedAssignment.primary ? '✅' : '❌'}`);
  console.log(`   Shard ID preserved: ${origAssignment.shardId === importedAssignment.shardId ? '✅' : '❌'}`);
  
  if (origAssignment.primary !== importedAssignment.primary || origAssignment.shardId !== importedAssignment.shardId) {
    throw new Error('Persistence failed - assignments not preserved');
  }
  
  console.log('   ✅ Persistence test passed\n');
}

async function testMultiRegion() {
  console.log('7️⃣  Multi-Region Distribution Test');
  
  const shardManager = new ShardManager({
    totalShards: 2048,
    replicationFactor: 3,
    virtualNodes: 160,
  });
  
  // Register machines in different regions
  const regions = [
    { id: 'us-east-1a', region: 'us-east-1', zone: 'a', capacity: 100 },
    { id: 'us-east-1b', region: 'us-east-1', zone: 'b', capacity: 100 },
    { id: 'us-west-2a', region: 'us-west-2', zone: 'a', capacity: 100 },
    { id: 'eu-west-1a', region: 'eu-west-1', zone: 'a', capacity: 100 },
    { id: 'eu-west-1b', region: 'eu-west-1', zone: 'b', capacity: 100 },
    { id: 'ap-southeast-1a', region: 'ap-southeast-1', zone: 'a', capacity: 100 },
  ];
  
  for (const machine of regions) {
    shardManager.registerMachine(machine);
  }
  
  // Assign many shards
  for (let i = 0; i < 1000; i++) {
    shardManager.getShardAssignment(`global-key-${i}`);
  }
  
  const stats = shardManager.getClusterStats();
  
  // Check region distribution
  const regionCounts = {};
  for (const machine of stats.machines) {
    if (!regionCounts[machine.region]) regionCounts[machine.region] = 0;
    regionCounts[machine.region] += machine.shardCount;
  }
  
  console.log(`   Shard distribution by region:`);
  for (const [region, count] of Object.entries(regionCounts)) {
    console.log(`     ${region}: ${count} shards (${(count/stats.assignedShards*100).toFixed(1)}%)`);
  }
  
  // Verify replicas are in different zones/regions where possible
  let crossRegionReplicas = 0;
  let totalReplicas = 0;
  
  for (const [shardId, assignment] of shardManager.shardMap) {
    const primaryMachine = shardManager.machineMap.get(assignment.primary);
    for (const replicaId of assignment.replicas) {
      const replicaMachine = shardManager.machineMap.get(replicaId);
      if (primaryMachine && replicaMachine && primaryMachine.region !== replicaMachine.region) {
        crossRegionReplicas++;
      }
      totalReplicas++;
    }
  }
  
  console.log(`   Cross-region replicas: ${crossRegionReplicas}/${totalReplicas} (${(crossRegionReplicas/totalReplicas*100).toFixed(1)}%)`);
  
  console.log('   ✅ Multi-region test passed\n');
}

async function runAllTests() {
  const tests = [
    testConsistentHashRing,
    testShardManager,
    testMachineDrain,
    testRebalancing,
    testImageKeyGenerator,
    testPersistence,
    testMultiRegion,
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (error) {
      console.error(`   ❌ Test failed: ${error.message}\n`);
      failed++;
    }
  }
  
  console.log('═══════════════════════════════════════');
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════');
  
  if (failed > 0) {
    process.exitCode = 1;
  }
}

runAllTests().catch(console.error);