import { readConfig } from '../server/auth.mjs';
import { createNeonRepository } from '../server/repository.mjs';
import { SeedError, prepareSeedState, seedWorkspaceIfEmpty } from '../server/workspace-seed.mjs';
import { createSeedState } from '../src/data/seed.ts';
import { toSharedState } from '../src/lib/workspace-api.ts';

/**
 * npm run db:init [-- --dry-run]
 *
 * Initialises the shared Neon workspace *before* anyone loads or refreshes the
 * app, so the first page view is a plain read instead of schema creation plus a
 * multi-megabyte seed write. Running it again is always a no-op: an existing
 * workspace is never replaced (use `npm run db:restore` for backups).
 */

// `npm run db:init` runs under vite-node (it imports the TypeScript seed), so
// read the ignored local .env here. Already-set variables win, as with the
// `--env-file-if-exists=.env` the db:restore script uses.
try { process.loadEnvFile('.env'); } catch { /* .env is optional; CI passes real variables */ }

const [flag, ...extra] = process.argv.slice(2);
const DRY_RUN = flag === '--dry-run';

if ((flag && !DRY_RUN) || extra.length) {
  console.error('Usage: npm run db:init [-- --dry-run]');
  process.exitCode = 1;
} else {
  try {
    const config = readConfig(process.env);
    if (config.mode !== 'shared') {
      throw new SeedError('Configure the target Neon database and workspace secrets in your local .env file. Nothing was changed.');
    }

    // Validate before touching the database so a bad seed never half-writes.
    const seed = prepareSeedState(toSharedState(createSeedState()));
    const repository = createNeonRepository(config.databaseUrl);

    if (DRY_RUN) {
      await repository.initialize();
      const current = await repository.read();
      console.log(current?.state
        ? `Workspace already initialised at revision ${current.version}. db:init would change nothing.`
        : `Workspace is empty. db:init would seed revision 1 (${(Buffer.byteLength(JSON.stringify(seed)) / 1024 / 1024).toFixed(2)} MB).`);
    } else {
      const result = await seedWorkspaceIfEmpty(repository, seed);
      if (result.seeded) {
        console.log(`Workspace initialised at revision ${result.version}. Data is ready before the first page load.`);
      } else if (result.reason === 'concurrent-initialisation') {
        console.log(`Another process initialised the workspace first at revision ${result.version}. Nothing was overwritten.`);
      } else {
        console.log(`Workspace already initialised at revision ${result.version}. Nothing was changed.`);
      }
    }
  } catch (error) {
    // Third-party database errors may contain a connection string or SQL data.
    // Only our own curated messages are printed; never error objects or secrets.
    console.error(error instanceof SeedError
      ? error.message
      : 'Initialisation failed. Check the local environment, workspace secrets and Neon availability. No credentials or workspace data were logged.');
    process.exitCode = 1;
  }
}
