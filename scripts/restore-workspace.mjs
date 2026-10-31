import { readFile } from 'node:fs/promises';
import { readConfig } from '../server/auth.mjs';
import { createNeonRepository } from '../server/repository.mjs';
import { workspaceSchema } from '../server/validation.mjs';
import { MAX_BODY_BYTES } from '../server/app.mjs';

const [file, confirmation, ...extra] = process.argv.slice(2);
if (!file || confirmation !== '--confirm' || extra.length) {
  console.error('Usage: npm run db:restore -- /path/to/backup.json --confirm');
  process.exitCode = 1;
} else {
  try {
    const config = readConfig(process.env);
    if (config.mode !== 'shared') throw new Error('Configure the target Neon database and workspace secrets in your local .env file.');
    const backup = JSON.parse(await readFile(file, 'utf8'));
    if (backup.settings) delete backup.settings.activeUserId;
    const parsed = workspaceSchema.safeParse(backup);
    if (!parsed.success) throw new Error('Backup validation failed. No database changes were made.');
    if (Buffer.byteLength(JSON.stringify({ version: 0, state: parsed.data })) > MAX_BODY_BYTES) {
      throw new Error('Backup exceeds the 4 MB pilot limit. Migrate to record-level storage before restoring it.');
    }
    const repository = createNeonRepository(config.databaseUrl);
    await repository.initialize();
    const current = await repository.read();
    const saved = await repository.save(current.version, parsed.data);
    if (!saved) throw new Error('Another device saved during the restore. No data was overwritten. Ask users to stop editing, then retry.');
    console.log(`Workspace restored as revision ${saved.version}. Verify the data on another device.`);
  } catch {
    // Third-party database errors may contain a connection string or SQL data.
    // Do not print error objects, backup contents or secrets into terminal/CI logs.
    console.error('Restore failed. Check the backup shape/size, local environment, Neon availability and concurrent edits. No credentials or workspace data were logged.');
    process.exitCode = 1;
  }
}
