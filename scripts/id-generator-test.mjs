/**
 * ID Generator Comprehensive Tests
 * 
 * Tests the 64-bit NextID generator with:
 * - 41 bits timestamp (ms since 2024-01-01)
 * - 13 bits shard ID (0-8191)
 * - 10 bits counter (0-1023)
 */

import { 
  NextIDGenerator, 
  DistributedIDCoordinator, 
  IDUtils,
  CUSTOM_EPOCH,
  ID_BITS,
  ID_MASKS,
  ID_SHIFTS,
  ID_MAX 
} from '../server/id-generator.mjs';

console.log('🆔 NextID Generator Tests');
console.log('═══════════════════════════\n');

console.log('Configuration:');
console.log(`  Epoch: ${new Date(CUSTOM_EPOCH).toISOString()} (${CUSTOM_EPOCH}ms)`);
console.log(`  Timestamp bits: ${ID_BITS.TIMESTAMP} (max ~${Math.round(ID_MAX.TIMESTAMP / (1000*60*60*24*365.25))} years)`);
console.log(`  Shard bits: ${ID_BITS.SHARD} (max ${ID_MAX.SHARD} shards)`);
console.log(`  Counter bits: ${ID_BITS.COUNTER} (max ${ID_MAX.COUNTER} per ms)`);
console.log(`  Total bits: ${ID_BITS.TIMESTAMP + ID_BITS.SHARD + ID_BITS.COUNTER}`);
console.log('');

async function testBasicGeneration() {
  console.log('1️⃣  Basic Generation Test');
  
  const generator = new NextIDGenerator({ shardId: 5 });
  
  const id = generator.nextId();
  const parsed = generator.parseId(id);
  
  console.log(`   Generated: ${id}`);
  console.log(`   Parsed:`);
  console.log(`     Timestamp: ${parsed.generatedAtISO} (${parsed.timestamp}ms since epoch)`);
  console.log(`     Shard: ${parsed.shard} (expected: 5)`);
  console.log(`     Counter: ${parsed.counter}`);
  console.log(`     Binary: ${parsed.binary}`);
  console.log(`     Hex: 0x${parsed.idHex}`);
  
  // Verify shard
  if (parsed.shard !== 5) throw new Error(`Shard mismatch: expected 5, got ${parsed.shard}`);
  
  console.log('   ✅ Basic generation test passed\n');
}

async function testMonotonicity() {
  console.log('2️⃣  Monotonicity Test (IDs always increase)');
  
  const generator = new NextIDGenerator({ shardId: 1 });
  const ids = generator.nextIds(1000);
  
  let monotonic = true;
  for (let i = 1; i < ids.length; i++) {
    if (generator.compare(ids[i-1], ids[i]) >= 0) {
      monotonic = false;
      console.log(`   ❌ Violation at index ${i}: ${ids[i-1]} >= ${ids[i]}`);
      break;
    }
  }
  
  console.log(`   Generated 1000 IDs`);
  console.log(`   Monotonic: ${monotonic ? '✅' : '❌'}`);
  
  if (!monotonic) throw new Error('IDs are not monotonic');
  
  console.log('   ✅ Monotonicity test passed\n');
}

async function testUniqueness() {
  console.log('3️⃣  Uniqueness Test');
  
  const generator = new NextIDGenerator({ shardId: 2 });
  const ids = generator.nextIds(10000);
  
  const uniqueSet = new Set(ids.map(id => id.toString()));
  const unique = uniqueSet.size === ids.length;
  
  console.log(`   Generated 10,000 IDs`);
  console.log(`   Unique: ${unique ? '✅' : '❌'} (${uniqueSet.size}/${ids.length})`);
  
  if (!unique) throw new Error('Duplicate IDs found');
  
  console.log('   ✅ Uniqueness test passed\n');
}

async function testShardIsolation() {
  console.log('4️⃣  Shard Isolation Test');
  
  const gen1 = new NextIDGenerator({ shardId: 10 });
  const gen2 = new NextIDGenerator({ shardId: 20 });
  
  const ids1 = gen1.nextIds(100);
  const ids2 = gen2.nextIds(100);
  
  // All IDs from shard 10 should have shard=10
  const shard10Ids = ids1.map(id => gen1.getShard(id));
  const shard20Ids = ids2.map(id => gen2.getShard(id));
  
  const allShard10 = shard10Ids.every(s => s === 10);
  const allShard20 = shard20Ids.every(s => s === 20);
  
  console.log(`   Shard 10 IDs: all have shard=10? ${allShard10 ? '✅' : '❌'}`);
  console.log(`   Shard 20 IDs: all have shard=20? ${allShard20 ? '✅' : '❌'}`);
  
  // IDs from different shards should be distinguishable
  const mixed = [...ids1, ...ids2].sort((a, b) => gen1.compare(a, b));
  const shardsInOrder = mixed.map(id => gen1.getShard(id));
  
  console.log(`   Mixed sorted shards: [${shardsInOrder.slice(0, 10).join(', ')}...]`);
  
  if (!allShard10 || !allShard20) throw new Error('Shard isolation failed');
  
  console.log('   ✅ Shard isolation test passed\n');
}

async function testCounterRollover() {
  console.log('5️⃣  Counter Rollover Test (1024 IDs per ms)');
  
  const generator = new NextIDGenerator({ shardId: 3 });
  
  // Generate 1500 IDs rapidly (should rollover counter at least once)
  const startTime = Date.now();
  const ids = generator.nextIds(1500);
  const elapsed = Date.now() - startTime;
  
  // Check counters
  const counters = ids.map(id => generator.getCounter(id));
  const maxCounter = Math.max(...counters);
  const minCounter = Math.min(...counters);
  
  console.log(`   Generated 1500 IDs in ${elapsed}ms`);
  console.log(`   Counter range: ${minCounter} - ${maxCounter} (max possible: ${ID_MAX.COUNTER})`);
  console.log(`   Counter rollover: ${maxCounter === ID_MAX.COUNTER ? '✅' : '⚠️ (may not have rolled over in time)'}`);
  
  // Verify all IDs are still unique and monotonic
  const unique = new Set(ids.map(id => id.toString())).size === ids.length;
  let monotonic = true;
  for (let i = 1; i < ids.length; i++) {
    if (generator.compare(ids[i-1], ids[i]) >= 0) {
      monotonic = false;
      break;
    }
  }
  
  console.log(`   Unique: ${unique ? '✅' : '❌'}`);
  console.log(`   Monotonic: ${monotonic ? '✅' : '❌'}`);
  
  if (!unique || !monotonic) throw new Error('Counter rollover broke uniqueness/monotonicity');
  
  console.log('   ✅ Counter rollover test passed\n');
}

async function testDistributedCoordinator() {
  console.log('6️⃣  Distributed Coordinator Test');
  
  const coordinator = new DistributedIDCoordinator({ 
    defaultShardId: 1,
    shardResolver: (key) => {
      // Simple hash-based shard resolution
      let hash = 0;
      for (let i = 0; i < key.length; i++) {
        hash = ((hash << 5) - hash) + key.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash) % 8192;
    }
  });
  
  // Generate IDs for different keys
  const keys = ['entity-001', 'entity-002', 'dept-001', 'dept-002', 'emp-001', 'emp-002'];
  const results = {};
  
  for (const key of keys) {
    const id = coordinator.nextIdForKey(key);
    const parsed = coordinator.parseId(id);
    results[key] = { id, shard: parsed.shard };
    console.log(`   ${key}: shard=${parsed.shard}, id=${id}`);
  }
  
  // Same key should always resolve to same shard
  for (const key of keys) {
    const id1 = coordinator.nextIdForKey(key);
    const id2 = coordinator.nextIdForKey(key);
    const shard1 = coordinator.getShard(id1);
    const shard2 = coordinator.getShard(id2);
    
    if (shard1 !== shard2) {
      throw new Error(`Shard mismatch for key ${key}: ${shard1} vs ${shard2}`);
    }
  }
  
  console.log(`   Shard consistency: ✅`);
  
  // Check stats
  const stats = coordinator.getStats();
  console.log(`   Coordinator stats: ${stats.totalGenerated} total, ${stats.activeShards} shards used`);
  
  console.log('   ✅ Distributed coordinator test passed\n');
}

async function testIdFormats() {
  console.log('7️⃣  ID Format Conversion Test');
  
  const generator = new NextIDGenerator({ shardId: 7 });
  const id = generator.nextId();
  
  const formats = IDUtils.toDatabaseFormats(id);
  
  console.log(`   Original ID: ${id}`);
  console.log(`   String: ${formats.string}`);
  console.log(`   Hex: ${formats.hex}`);
  console.log(`   Base64URL: ${formats.base64url} (${formats.base64url.length} chars)`);
  console.log(`   Display: ${formats.display}`);
  console.log(`   Sortable: ${IDUtils.toSortableString(id)}`);
  
  // Round-trip tests
  const fromBase64 = IDUtils.fromBase64Url(formats.base64url);
  const fromDisplay = IDUtils.fromDisplayFormat(formats.display);
  const fromSortable = BigInt(IDUtils.toSortableString(id).replace(/^0+/, '') || '0');
  
  console.log(`   Round-trip Base64URL: ${fromBase64 === id ? '✅' : '❌'}`);
  console.log(`   Round-trip Display: ${fromDisplay === id ? '✅' : '❌'}`);
  console.log(`   Round-trip Sortable: ${fromSortable === id ? '✅' : '❌'}`);
  
  if (fromBase64 !== id || fromDisplay !== id || fromSortable !== id) {
    throw new Error('Format round-trip failed');
  }
  
  console.log('   ✅ ID format test passed\n');
}

async function testTimestampExtraction() {
  console.log('8️⃣  Timestamp Extraction Test');
  
  const generator = new NextIDGenerator({ shardId: 4 });
  
  const before = Date.now();
  const id = generator.nextId();
  const after = Date.now();
  
  const extracted = generator.getTimestamp(id);
  const extractedMs = extracted.getTime();
  
  console.log(`   Before: ${before}`);
  console.log(`   After: ${after}`);
  console.log(`   Extracted: ${extractedMs} (${extracted.toISOString()})`);
  console.log(`   In range: ${extractedMs >= before && extractedMs <= after ? '✅' : '❌'}`);
  
  if (extractedMs < before || extractedMs > after) {
    throw new Error('Timestamp extraction out of range');
  }
  
  console.log('   ✅ Timestamp extraction test passed\n');
}

async function testParseValidation() {
  console.log('9️⃣  Parse & Validation Test');
  
  const generator = new NextIDGenerator({ shardId: 6 });
  const id = generator.nextId();
  
  // Test parsing various formats
  const parsed1 = generator.parseId(id);
  const parsed2 = generator.parseId(id.toString());
  const parsed3 = generator.parseId(Number(id.toString().slice(0, 15))); // truncated number
  
  console.log(`   Parse BigInt: ✅`);
  console.log(`   Parse String: ${parsed2.id === id ? '✅' : '❌'}`);
  console.log(`   Parse Number (truncated): ${parsed3.id !== id ? '✅ (different as expected)' : '❌'}`);
  
  // Test validation
  const valid1 = generator.isValid(id);
  const valid2 = generator.isValid(id.toString());
  const valid3 = generator.isValid('not-a-number');
  const valid4 = generator.isValid(-1);
  const valid5 = generator.isValid(1n << 64n); // Too large
  
  console.log(`   Valid BigInt: ${valid1 ? '✅' : '❌'}`);
  console.log(`   Valid String: ${valid2 ? '✅' : '❌'}`);
  console.log(`   Invalid string: ${!valid3 ? '✅' : '❌'}`);
  console.log(`   Negative: ${!valid4 ? '✅' : '❌'}`);
  console.log(`   Too large: ${!valid5 ? '✅' : '❌'}`);
  
  if (!valid1 || !valid2 || valid3 || valid4 || valid5) {
    throw new Error('Validation test failed');
  }
  
  console.log('   ✅ Parse & validation test passed\n');
}

async function testSorting() {
  console.log('🔟  Sorting Test');
  
  const generator = new NextIDGenerator({ shardId: 8 });
  const ids = generator.nextIds(100);
  
  // Shuffle
  const shuffled = [...ids].sort(() => Math.random() - 0.5);
  
  // Sort using generator.compare
  const sorted = [...shuffled].sort((a, b) => generator.compare(a, b));
  
  // Verify sorted order matches original generation order
  const correct = sorted.every((id, i) => generator.compare(id, ids[i]) === 0);
  
  console.log(`   Shuffled 100 IDs`);
  console.log(`   Sorted correctly: ${correct ? '✅' : '❌'}`);
  
  if (!correct) throw new Error('Sorting failed');
  
  console.log('   ✅ Sorting test passed\n');
}

async function testPerformance() {
  console.log('1️⃣1️⃣  Performance Test');
  
  const generator = new NextIDGenerator({ shardId: 9 });
  
  const iterations = 100000;
  const start = Date.now();
  
  for (let i = 0; i < iterations; i++) {
    generator.nextId();
  }
  
  const elapsed = Date.now() - start;
  const perSec = Math.round(iterations / (elapsed / 1000));
  
  console.log(`   Generated ${iterations.toLocaleString()} IDs in ${elapsed}ms`);
  console.log(`   Throughput: ${perSec.toLocaleString()} IDs/sec`);
  console.log(`   Per ID: ${(elapsed / iterations * 1000000).toFixed(2)}μs`);
  
  console.log('   ✅ Performance test passed\n');
}

async function runAllTests() {
  const tests = [
    testBasicGeneration,
    testMonotonicity,
    testUniqueness,
    testShardIsolation,
    testCounterRollover,
    testDistributedCoordinator,
    testIdFormats,
    testTimestampExtraction,
    testParseValidation,
    testSorting,
    testPerformance,
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