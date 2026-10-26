import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createRepository } from '../server/repository.mjs';
import { SeedError, prepareSeedState, seedWorkspaceIfEmpty } from '../server/workspace-seed.mjs';

const seed = {
  entities: [{ id: 'group', name: 'Group', code: 'G', type: 'group', parentId: null, countryCode: 'AU', timezone: 'Australia/Sydney' }],
  departments: [{ id: 'dept', entityId: 'group', name: 'Finance', code: 'FIN', headId: null, opsOwnerId: null, costCenter: '', color: '#333333' }],
  employees: [{ id: 'employee', name: 'Pilot', email: 'pilot@example.com', code: 'P1', entityId: 'group', departmentId: 'dept', role: 'ceo', managerId: null, countryCode: 'AU', weeklyHours: 40, joinDate: '2026-10-21', status: 'active', avatarColor: '#333333' }],
  activities: [], timeEntries: [], holidays: [],
  countries: [{ code: 'AU', name: 'Australia', flag: 'AU', weeklyOff: [0, 6], timezone: 'Australia/Sydney' }],
  escalations: [], connections: [], syncJobs: [], auditLog: [], standups: [],
  settings: { groupName: 'Pilot', workingDayStart: '09:00', workingDayEnd: '17:00', holidayHorizonYears: 5, performanceThreshold: 70, weekStartsOn: 1 },
};

let pg;
before(async () => { pg = new PGlite(); });
after(async () => { await pg.close(); });

const repository = () => createRepository(async (sql, parameters = []) => (await pg.query(sql, parameters)).rows);

test('db:init seeds an empty database exactly once, before any page load', async () => {
  const db = repository();
  const first = await seedWorkspaceIfEmpty(db, { ...seed, settings: { ...seed.settings, activeUserId: 'employee' } });
  assert.deepEqual(first, { seeded: true, version: 1, reason: 'seeded' });

  const stored = await db.read();
  assert.equal(stored.version, 1);
  assert.equal('activeUserId' in stored.state.settings, false, 'device persona must never enter shared storage');
  assert.equal(stored.state.settings.groupName, 'Pilot');

  const second = await seedWorkspaceIfEmpty(db, seed);
  assert.deepEqual(second, { seeded: false, version: 1, reason: 'already-initialised' }, 'a refresh or repeated CLI run must never reseed');
  assert.equal((await db.read()).version, 1);
});

test('a seed that fails validation or the size limit writes nothing', async () => {
  const emptyPg = new PGlite();
  const untouched = createRepository(async (sql, parameters = []) => (await emptyPg.query(sql, parameters)).rows);

  assert.throws(() => prepareSeedState({ ...seed, employees: [] }), SeedError);
  assert.throws(() => prepareSeedState(null), SeedError);
  assert.throws(() => prepareSeedState(seed, { maxBytes: 32 }), /3 MB pilot limit/);
  assert.throws(() => prepareSeedState({ ...seed, settings: { ...seed.settings, weekStartsOn: 3 } }), SeedError);
  await assert.rejects(() => seedWorkspaceIfEmpty(untouched, { ...seed, departments: [] }), SeedError);
  // The guard runs before any DDL/DML, so the database is still untouched.
  await assert.rejects(() => untouched.read(), /does not exist/i);

  await emptyPg.close();
});

test('concurrent first writers resolve to the winner instead of overwriting it', async () => {
  const racePg = new PGlite();
  const db = createRepository(async (sql, parameters = []) => (await racePg.query(sql, parameters)).rows);
  await db.initialize();
  let competing = true;
  const racing = {
    initialize: async () => {},
    read: () => db.read(),
    save: async (version, state) => {
      if (competing) {
        competing = false;
        // Another first-time writer (a browser or a second CLI run) wins the
        // INSERT … ON CONFLICT DO NOTHING, so this writer inserts nothing.
        assert.ok(await db.save(0, state));
        return null;
      }
      return db.save(version, state);
    },
  };
  const result = await seedWorkspaceIfEmpty(racing, seed);
  assert.deepEqual(result, { seeded: false, version: 1, reason: 'concurrent-initialisation' });
  assert.equal((await db.read()).version, 1);
  await racePg.close();
});

test('--dry-run and the default path share the same validated payload', async () => {
  const prepared = prepareSeedState(seed);
  assert.deepEqual(prepared, seed);
  assert.deepEqual(Object.keys(prepared).sort(), Object.keys(seed).sort());
});
