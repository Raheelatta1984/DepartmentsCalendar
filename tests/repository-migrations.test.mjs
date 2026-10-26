import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createRepository, migrations } from '../server/repository.mjs';

test('Neon migrations add updated_at to existing image tables before shard moves use it', async () => {
  const pg = new PGlite();
  try {
    const currentImagesMigration = migrations.find((sql) => sql.includes('CREATE TABLE IF NOT EXISTS public.orbit_images'));
    assert.ok(currentImagesMigration);
    const legacyImagesMigration = currentImagesMigration.replace('    updated_at timestamptz NOT NULL DEFAULT now(),\n', '');
    assert.notEqual(legacyImagesMigration, currentImagesMigration, 'the fixture represents the older table shape');
    await pg.query(legacyImagesMigration);

    const repository = createRepository(async (sql, parameters = []) => (await pg.query(sql, parameters)).rows);
    await repository.initialize();

    const columns = await pg.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'orbit_images'
    `);
    assert.ok(columns.rows.some((column) => column.column_name === 'updated_at'));

    const image = await repository.saveImage({
      id: 1,
      shardId: 1,
      machineId: 'machine-1',
      replicaMachines: [],
      key: 'orbit-img/test.png',
      originalName: 'test.png',
      mimeType: 'image/png',
      sizeBytes: 1,
      width: 1,
      height: 1,
      entityId: null,
      departmentId: null,
      employeeId: null,
      type: 'general',
      metadata: {},
      uploadedBy: 'test',
    });
    assert.ok(image.updated_at);

    const moved = await repository.moveImageShard('orbit-img/test.png', 2, 'machine-2', []);
    assert.equal(moved.shard_id, 2);
    assert.ok(moved.updated_at);
  } finally {
    await pg.close();
  }
});
