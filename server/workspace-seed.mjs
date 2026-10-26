import { MAX_BODY_BYTES } from './app.mjs';
import { workspaceSchema } from './validation.mjs';

/**
 * One-shot workspace initialisation, safe to run before anybody opens the app.
 *
 * The first browser visit used to be the only thing that created the pilot
 * dataset (src/components/WorkspaceGateway.tsx). That made the very first
 * request of a fresh deployment do schema creation *and* a multi-megabyte
 * write. `npm run db:init` runs the same seeding step ahead of time, from the
 * command line, so a page load or refresh only ever reads.
 *
 * Guarantees:
 * - never overwrites an existing workspace (any revision means "already done");
 * - never races another first-time writer: the INSERT in repository.save(0, …)
 *   is ON CONFLICT DO NOTHING, so a loser reports the winner's revision;
 * - validates and size-checks before writing, so a bad seed changes nothing;
 * - throws safe messages only, never connection strings or workspace data.
 */

export class SeedError extends Error {}

/** activeUserId is a per-device persona preference; it must never be shared. */
function withoutDevicePersona(state) {
  if (typeof state?.settings?.activeUserId !== 'string') return state;
  const { activeUserId: _devicePersona, ...settings } = state.settings;
  return { ...state, settings };
}

export function prepareSeedState(state, { maxBytes = MAX_BODY_BYTES } = {}) {
  const shared = withoutDevicePersona(state);
  const parsed = workspaceSchema.safeParse(shared);
  if (!parsed.success) {
    throw new SeedError('The seed dataset failed workspace validation. No database changes were made.');
  }
  if (Buffer.byteLength(JSON.stringify({ version: 0, state: parsed.data })) > maxBytes) {
    throw new SeedError('The seed dataset exceeds the 3 MB pilot limit. No database changes were made.');
  }
  return parsed.data;
}

/**
 * @param repository repository returned by createRepository()/createNeonRepository()
 * @param state      the seed StoreState (normally createSeedState())
 * @returns {Promise<{seeded: boolean, version: number, reason: string}>}
 */
export async function seedWorkspaceIfEmpty(repository, state, { maxBytes = MAX_BODY_BYTES } = {}) {
  const seed = prepareSeedState(state, { maxBytes });
  await repository.initialize();

  const current = await repository.read();
  if (current?.state) return { seeded: false, version: current.version, reason: 'already-initialised' };

  // version 0 means "expect no row yet"; the INSERT is ON CONFLICT DO NOTHING
  // so a concurrent seed (another CLI run or a first browser visit) wins.
  const saved = await repository.save(0, seed);
  if (saved) return { seeded: true, version: saved.version, reason: 'seeded' };

  const winner = await repository.read();
  if (!winner?.state) throw new SeedError('The workspace could not be initialised. Please retry.');
  return { seeded: false, version: winner.version, reason: 'concurrent-initialisation' };
}

export default { SeedError, prepareSeedState, seedWorkspaceIfEmpty };
