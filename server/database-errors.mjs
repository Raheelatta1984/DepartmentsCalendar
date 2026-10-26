const RETRYABLE_NETWORK_CODES = new Set([
  'ABORT_ERR',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

const CONFIGURATION_CODES = new Set([
  'ENOTFOUND',
  'ERR_INVALID_URL',
]);

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const safeFailure = (code, retryable, message) => ({
  code,
  retryable,
  status: 503,
  message,
});

function errorChain(error) {
  const chain = [];
  const seen = new Set();
  let current = error;
  for (let depth = 0; current && depth < 5 && !seen.has(current); depth++, current = current.cause) {
    if (typeof current !== 'object' && typeof current !== 'function') break;
    seen.add(current);
    chain.push(current);
  }
  return chain;
}

/**
 * Convert provider/driver failures into safe, actionable API errors.
 *
 * SQLSTATE and transport metadata are inspected server-side only. Neither raw
 * error messages nor connection strings are returned to the browser or logs.
 * Unknown failures are deliberately not auto-retried: the caller can still
 * make a manual attempt after checking the Neon setup.
 */
export function classifyDatabaseError(error) {
  const chain = errorChain(error);
  const sqlState = chain
    .map((entry) => String(entry.code ?? entry.sqlState ?? ''))
    .find((code) => /^[0-9A-Z]{5}$/.test(code));

  if (sqlState) {
    const classCode = sqlState.slice(0, 2);
    if (classCode === '08' || ['40', '53', '55', '57', '58'].includes(classCode)) {
      return safeFailure(
        'DATABASE_UNAVAILABLE',
        true,
        'Neon is temporarily unavailable. Check the Neon project status and try again. Saved data has not been deleted.',
      );
    }
    if (classCode === '28') {
      return safeFailure(
        'DATABASE_CREDENTIALS',
        false,
        'Neon rejected the database credentials. Check the server-side DATABASE_URL and redeploy; repeated refreshes will not fix incorrect credentials.',
      );
    }
    if (classCode === '3F' || classCode === '42' || sqlState === '42501') {
      return safeFailure(
        'DATABASE_SCHEMA_OR_PERMISSION',
        false,
        'Neon is reachable, but the database schema or role permissions are not ready. Run npm run db:init with the Neon database owner, or apply docs/neon.sql, then retry.',
      );
    }
    if (classCode === '22' || classCode === '23') {
      return safeFailure(
        'DATABASE_DATA_ERROR',
        false,
        'Neon rejected the stored data. Automatic retries have stopped; check the workspace data and server logs before retrying.',
      );
    }
  }

  const providerStatus = chain
    .map((entry) => Number(entry.statusCode ?? entry.status))
    .find((status) => Number.isInteger(status) && status >= 100 && status <= 599);

  if (providerStatus === 401 || providerStatus === 403) {
    return safeFailure(
      'DATABASE_CREDENTIALS',
      false,
      'Neon rejected the database credentials. Check the server-side DATABASE_URL and redeploy; repeated refreshes will not fix incorrect credentials.',
    );
  }
  if (providerStatus === 404) {
    return safeFailure(
      'DATABASE_ENDPOINT_NOT_FOUND',
      false,
      'The Neon database endpoint was not found. Check that DATABASE_URL points to the correct Neon project, branch and database, then redeploy.',
    );
  }
  if (providerStatus !== undefined && RETRYABLE_HTTP_STATUSES.has(providerStatus)) {
    return safeFailure(
      'DATABASE_UNAVAILABLE',
      true,
      'Neon is temporarily unavailable. Check the Neon project status and try again. Saved data has not been deleted.',
    );
  }

  const codes = chain.map((entry) => String(entry.code ?? '').toUpperCase());
  if (codes.some((code) => RETRYABLE_NETWORK_CODES.has(code))) {
    return safeFailure(
      'DATABASE_UNAVAILABLE',
      true,
      'Neon is temporarily unavailable. Check the Neon project status and try again. Saved data has not been deleted.',
    );
  }
  if (codes.some((code) => CONFIGURATION_CODES.has(code))) {
    return safeFailure(
      'DATABASE_ENDPOINT_NOT_FOUND',
      false,
      'The Neon database endpoint could not be resolved. Check DATABASE_URL and confirm that it belongs to an active Neon project, then redeploy.',
    );
  }

  const messages = chain.map((entry) => String(entry.message ?? '')).join(' ').toLowerCase();
  if (/econn(?:aborted|refused|reset)|etimedout|ehostunreach|eai_again|enetunreach|fetch failed|network error|socket hang up|connection (?:reset|refused|closed)|timed? out|timeout/.test(messages)) {
    return safeFailure(
      'DATABASE_UNAVAILABLE',
      true,
      'Neon is temporarily unavailable. Check the Neon project status and try again. Saved data has not been deleted.',
    );
  }
  if (/password authentication failed|authentication failed|permission denied|does not exist|undefined table|undefined column|syntax error/.test(messages)) {
    return safeFailure(
      /password authentication failed|authentication failed/.test(messages)
        ? 'DATABASE_CREDENTIALS'
        : 'DATABASE_SCHEMA_OR_PERMISSION',
      false,
      /password authentication failed|authentication failed/.test(messages)
        ? 'Neon rejected the database credentials. Check the server-side DATABASE_URL and redeploy; repeated refreshes will not fix incorrect credentials.'
        : 'Neon is reachable, but the database schema or role permissions are not ready. Run npm run db:init with the Neon database owner, or apply docs/neon.sql, then retry.',
    );
  }

  return safeFailure(
    'DATABASE_ERROR',
    false,
    'Neon returned an unexpected database error. Automatic retries have stopped to avoid a loop. Check the server logs, DATABASE_URL, schema and role permissions before retrying.',
  );
}

export default classifyDatabaseError;
