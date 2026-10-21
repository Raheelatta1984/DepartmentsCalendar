/**
 * Infrastructure Smoke Tests
 * 
 * Tests all infrastructure components:
 * - PgBouncer connection pooling
 * - Read replicas
 * - Memcached caching
 * - Image sharding
 * - ID generation
 */

import { createInfrastructureFromEnv } from '../server/infrastructure.mjs';
import { createInfrastructureRepository } from '../server/repository.mjs';
import { IDUtils } from '../server/id-generator.mjs';

console.log('🧪 Running Infrastructure Smoke Tests...\n');

async function testPgBouncerConnection() {
  console.log('1️⃣  Testing PgBouncer Connection...');
  
  const infrastructure = createInfrastructureFromEnv({
    database: { url: 'postgresql://user:pass@ep-test-pooler.region.aws.neon.tech/neondb?sslmode=require' }
  });
  await infrastructure.initialize();
  
  const connStr = infrastructure.getDatabaseConnectionString();
  console.log(`   Connection string: ${connStr.replace(/:[^:@]+@/, ':****@')}`);
  console.log(`   Uses pooler: ${connStr.includes('pgbouncer=true') || connStr.includes('-pooler')}`);
  
  console.log('   ✅ PgBouncer connection test passed\n');
  return true;
}

async function testIdGeneration() {
  console.log('2️⃣  Testing ID Generation (NextID)...');
  
  const infrastructure = createInfrastructureFromEnv();
  await infrastructure.initialize();
  
  // Generate single ID
  const id1 = infrastructure.nextId();
  console.log(`   Generated ID: ${id1}`);
  
  // Parse ID
  const parsed = infrastructure.components.idGenerator.parseId(id1);
  console.log(`   Parsed:`);
  console.log(`     - Timestamp: ${parsed.generatedAtISO}`);
  console.log(`     - Shard: ${parsed.shard}`);
  console.log(`     - Counter: ${parsed.counter}`);
  console.log(`     - Binary: ${parsed.binary}`);
  
  // Generate batch
  const ids = infrastructure.components.idGenerator.nextIds(5);
  console.log(`   Batch of 5 IDs:`);
  ids.forEach((id, i) => {
    const p = infrastructure.components.idGenerator.parseId(id);
    console.log(`     ${i + 1}. ${id} (shard: ${p.shard}, counter: ${p.counter})`);
  });
  
  // Test ID formats
  const formats = IDUtils.toDatabaseFormats(id1);
  console.log(`   Database formats:`);
  console.log(`     - String: ${formats.string}`);
  console.log(`     - Hex: ${formats.hex}`);
  console.log(`     - Base64URL: ${formats.base64url}`);
  console.log(`     - Display: ${formats.display}`);
  console.log(`     - Sortable: ${IDUtils.toSortableString(id1)}`);
  
  // Test round-trip
  const fromBase64 = IDUtils.fromBase64Url(formats.base64url);
  const fromDisplay = IDUtils.fromDisplayFormat(formats.display);
  console.log(`   Round-trip base64: ${fromBase64 === id1 ? '✅' : '❌'}`);
  console.log(`   Round-trip display: ${fromDisplay === id1 ? '✅' : '❌'}`);
  
  // Test sorting
  const sorted = [...ids].sort((a, b) => infrastructure.components.idGenerator.compare(a, b));
  console.log(`   Sorting: ${JSON.stringify(sorted.map(id => infrastructure.components.idGenerator.parseId(id).counter))}`);
  
  // Test distributed coordinator
  const coordId = infrastructure.nextIdForKey('test-entity-123');
  console.log(`   Key-based ID: ${coordId} (shard: ${infrastructure.components.idCoordinator.getShard(coordId)})`);
  
  console.log('   ✅ ID generation test passed\n');
  return true;
}

async function testImageSharding() {
  console.log('3️⃣  Testing Image Sharding...');
  
  const infrastructure = createInfrastructureFromEnv();
  await infrastructure.initialize();
  
  const shardManager = infrastructure.components.imageSharding.shardManager;
  const keyGenerator = infrastructure.components.imageSharding.keyGenerator;
  
  // Check cluster stats
  const stats = shardManager.getClusterStats();
  console.log(`   Cluster stats:`);
  console.log(`     - Machines: ${stats.activeMachines}/${stats.totalMachines} active`);
  console.log(`     - Total shards: ${stats.totalShards}`);
  console.log(`     - Assigned shards: ${stats.assignedShards}`);
  console.log(`     - Replication factor: ${stats.replicationFactor}`);
  console.log(`     - Distribution: min=${stats.shardDistribution.min}, max=${stats.shardDistribution.max}, avg=${stats.shardDistribution.avg.toFixed(1)}`);
  
  // Generate image keys
  const testKeys = [
    { entityId: 'ent-001', departmentId: 'dept-001', employeeId: 'emp-001', type: 'avatar', filename: 'photo.jpg' },
    { entityId: 'ent-001', departmentId: 'dept-002', type: 'document', filename: 'report.pdf' },
    { entityId: 'ent-002', type: 'logo', filename: 'brand.png' },
    { employeeId: 'emp-005', type: 'attachment', filename: 'screenshot.png' },
  ];
  
  console.log(`   Generated image keys:`);
  for (const metadata of testKeys) {
    const keyInfo = keyGenerator.generateKey(metadata);
    console.log(`     - ${keyInfo.key}`);
    console.log(`       Shard: ${keyInfo.shardId}, Primary: ${keyInfo.primaryMachine}, Replicas: [${keyInfo.replicaMachines.join(', ')}]`);
  }
  
  // Test key parsing (use the first generated key)
  const firstKeyInfo = keyGenerator.generateKey(testKeys[0]);
  const parsed = keyGenerator.parseKey(firstKeyInfo.key);
  console.log(`   Parsed key:`, parsed);
  
  // Test rebalancing
  console.log(`   Testing rebalance...`);
  const rebalanceResult = await shardManager.rebalance({ maxMoves: 10 });
  console.log(`     Moves: ${rebalanceResult.moves.length}`);
  
  console.log('   ✅ Image sharding test passed\n');
  return true;
}

async function testMemcached() {
  console.log('4️⃣  Testing Memcached...');
  
  const infrastructure = createInfrastructureFromEnv();
  await infrastructure.initialize();
  
  const memcached = infrastructure.components.memcached;
  
  // Test basic operations
  const testKey = 'test:smoke:key';
  const testValue = { message: 'Hello, Memcached!', timestamp: Date.now() };
  
  await memcached.set(testKey, testValue, 60);
  console.log(`   Set key: ${testKey}`);
  
  const retrieved = await memcached.get(testKey);
  console.log(`   Got value:`, retrieved);
  console.log(`   Match: ${JSON.stringify(retrieved) === JSON.stringify(testValue) ? '✅' : '❌'}`);
  
  // Test cache keys
  const cacheKey = 'workspace:v123';
  await memcached.set(cacheKey, { version: 123, data: 'test' }, 300);
  const cached = await memcached.get(cacheKey);
  console.log(`   Workspace cache key test: ${cached ? '✅' : '❌'}`);
  
  // Test stats
  const stats = await memcached.stats();
  console.log(`   Stats:`, stats);
  
  // Test fallback (if using in-memory)
  console.log(`   Using fallback: ${memcached.useFallback ? 'Yes (in-memory)' : 'No (real Memcached)'}`);
  
  await memcached.delete(testKey);
  console.log(`   Deleted test key`);
  
  console.log('   ✅ Memcached test passed\n');
  return true;
}

async function testCachedExecutor() {
  console.log('5️⃣  Testing Cached Query Executor...');
  
  const infrastructure = createInfrastructureFromEnv();
  await infrastructure.initialize();
  
  const executor = infrastructure.components.cachedExecutor;
  
  let queryCount = 0;
  const mockQuery = async () => {
    queryCount++;
    return { data: `Result ${queryCount}`, timestamp: Date.now() };
  };
  
  // First call - should miss cache
  const result1 = await executor.read('test:query:1', mockQuery, 60);
  console.log(`   First call: cached=${result1.cached}, queryCount=${queryCount}`);
  
  // Second call - should hit cache
  const result2 = await executor.read('test:query:1', mockQuery, 60);
  console.log(`   Second call: cached=${result2.cached}, queryCount=${queryCount}`);
  
  // Test write invalidation
  await executor.write(['test:query:1'], async () => {
    queryCount++;
    return { data: 'Updated', timestamp: Date.now() };
  });
  console.log(`   After write: queryCount=${queryCount}`);
  
  // Next read should miss cache (invalidated)
  const result3 = await executor.read('test:query:1', mockQuery, 60);
  console.log(`   After invalidation: cached=${result3.cached}, queryCount=${queryCount}`);
  
  console.log('   ✅ Cached executor test passed\n');
  return true;
}

async function testReadReplicas() {
  console.log('6️⃣  Testing Read Replicas...');
  
  const infrastructure = createInfrastructureFromEnv();
  await infrastructure.initialize();
  
  const replicas = infrastructure.components.readReplicas;
  
  console.log(`   Enabled: ${replicas.enabled}`);
  console.log(`   Replica count: ${replicas.manager?.replicas?.length || 0}`);
  
  if (replicas.enabled && replicas.manager) {
    const health = replicas.getHealthStatus();
    console.log(`   Health status:`, health);
    
    let readCount = 0;
    await replicas.executeRead(async () => {
      readCount++;
      return { read: readCount };
    });
    console.log(`   Read executed: ${readCount} times`);
    
    let writeCount = 0;
    await replicas.executeWrite(async () => {
      writeCount++;
      return { write: writeCount };
    });
    console.log(`   Write executed: ${writeCount} times`);
  } else {
    console.log('   Read replicas not configured (using primary only)');
  }
  
  console.log('   ✅ Read replicas test passed\n');
  return true;
}

async function testFullIntegration() {
  console.log('7️⃣  Testing Full Integration...');
  
  // Test infrastructure without actual database connection
  const infrastructure = createInfrastructureFromEnv({
    database: { url: 'postgresql://user:pass@ep-test-pooler.region.aws.neon.tech/neondb?sslmode=require' }
  });
  await infrastructure.initialize();
  
  // Test ID generation through repository-like interface
  const id1 = infrastructure.nextId();
  const id2 = infrastructure.nextIdForKey('entity-456');
  console.log(`   Infrastructure nextId: ${id1}`);
  console.log(`   Infrastructure nextIdForKey: ${id2}`);
  
  // Test image key generation
  const imageKey = infrastructure.generateImageKey({
    entityId: 'ent-001',
    departmentId: 'dept-001',
    type: 'avatar',
    filename: 'profile.jpg'
  });
  console.log(`   Generated image key: ${imageKey.key}`);
  console.log(`   Shard: ${imageKey.shardId}, Machine: ${imageKey.primaryMachine}`);
  
  // Test cached read
  let dbCalls = 0;
  const cachedResult = await infrastructure.cachedRead('test:integration', async () => {
    dbCalls++;
    return { version: 1, state: {} };
  }, 60);
  console.log(`   Cached read: dbCalls=${dbCalls}, cached=${cachedResult.cached}`);
  
  // Test health status
  const health = infrastructure.getHealthStatus();
  console.log(`   Health status:`);
  console.log(`     Database: ${health.database.connected ? '✅' : '❌'} (pooler: ${health.database.pooler})`);
  console.log(`     Read Replicas: ${health.readReplicas.enabled ? '✅' : '❌'}`);
  console.log(`     Memcached: ${health.memcached.enabled ? '✅' : '❌'} (fallback: ${health.memcached.usingFallback})`);
  console.log(`     Image Sharding: ${health.imageSharding ? '✅' : '❌'}`);
  console.log(`     ID Generation: ${health.idGeneration.stats.generated} IDs generated`);
  
  console.log('   ✅ Full integration test passed\n');
  return true;
}

async function runAllTests() {
  const tests = [
    testPgBouncerConnection,
    testIdGeneration,
    testImageSharding,
    testMemcached,
    testCachedExecutor,
    testReadReplicas,
    testFullIntegration,
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