/**
 * PgBouncer Configuration and Connection Pool Management
 */

export const PGBOUNCER_MODES = {
  SESSION: 'session',
  TRANSACTION: 'transaction',
  STATEMENT: 'statement'
};

export const PGBOUNCER_DEFAULTS = {
  poolMode: PGBOUNCER_MODES.SESSION,
  maxClientConn: 1000,
  defaultPoolSize: 25,
  minPoolSize: 5,
  reservePoolSize: 5,
  reservePoolTimeout: 5,
  maxDbConnections: 100,
  maxUserConnections: 100,
  serverLifetime: 3600,
  serverIdleTimeout: 600,
  serverConnectTimeout: 15,
  serverLoginRetry: 15,
  queryTimeout: 0,
  queryWaitTimeout: 120,
  clientIdleTimeout: 0,
  clientLoginTimeout: 60,
  autodbIdleTimeout: 3600,
  dnsMaxTtl: 15,
  dnsNxdomainTtl: 15,
  dnsZoneCheckPeriod: 0,
  tcpKeepalive: 1,
  tcpKeepcnt: 0,
  tcpKeepidle: 0,
  tcpKeepintvl: 0,
};

export function generatePgBouncerConfig(config = {}) {
  const c = { ...PGBOUNCER_DEFAULTS, ...config };
  return `[databases]
${c.databaseName || 'neondb'} = host=${c.host} port=${c.port || 5432} dbname=${c.databaseName || 'neondb'} user=${c.user} password=${c.password} sslmode=require

[pgbouncer]
pool_mode = ${c.poolMode}
max_client_conn = ${c.maxClientConn}
default_pool_size = ${c.defaultPoolSize}
min_pool_size = ${c.minPoolSize}
reserve_pool_size = ${c.reservePoolSize}
reserve_pool_timeout = ${c.reservePoolTimeout}
max_db_connections = ${c.maxDbConnections}
max_user_connections = ${c.maxUserConnections}
server_lifetime = ${c.serverLifetime}
server_idle_timeout = ${c.serverIdleTimeout}
server_connect_timeout = ${c.serverConnectTimeout}
server_login_retry = ${c.serverLoginRetry}
query_timeout = ${c.queryTimeout}
query_wait_timeout = ${c.queryWaitTimeout}
client_idle_timeout = ${c.clientIdleTimeout}
client_login_timeout = ${c.clientLoginTimeout}
autodb_idle_timeout = ${c.autodbIdleTimeout}
dns_max_ttl = ${c.dnsMaxTtl}
dns_nxdomain_ttl = ${c.dnsNxdomainTtl}
dns_zone_check_period = ${c.dnsZoneCheckPeriod}
tcp_keepalive = ${c.tcpKeepalive}
tcp_keepcnt = ${c.tcpKeepcnt}
tcp_keepidle = ${c.tcpKeepidle}
tcp_keepintvl = ${c.tcpKeepintvl}

log_connections = 1
log_disconnections = 1
log_pooler_errors = 1
stats_period = 60

admin_users = ${c.adminUser || 'postgres'}
ignore_startup_parameters = extra_float_digits,application_name
`;
}

export function createPooledConnectionString(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    if (!url.hostname.includes('-pooler')) {
      const parts = url.hostname.split('.');
      if (parts.length >= 3) {
        parts[0] = `${parts[0]}-pooler`;
        url.hostname = parts.join('.');
      }
    }
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('pgbouncer', 'true');
    url.searchParams.set('connection_limit', '100');
    return url.toString();
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL: ${error.message}`);
  }
}

export function validatePgBouncerConfig(config) {
  const errors = [];
  if (!config.host) errors.push('host is required');
  if (!config.user) errors.push('user is required');
  if (!config.password) errors.push('password is required');
  if (!config.databaseName) errors.push('databaseName is required');
  if (config.poolMode && !Object.values(PGBOUNCER_MODES).includes(config.poolMode)) {
    errors.push(`Invalid poolMode: ${config.poolMode}. Must be one of: ${Object.values(PGBOUNCER_MODES).join(', ')}`);
  }
  if (config.defaultPoolSize && (config.defaultPoolSize < 1 || config.defaultPoolSize > 1000)) {
    errors.push('defaultPoolSize must be between 1 and 1000');
  }
  if (config.maxClientConn && config.maxClientConn < 1) {
    errors.push('maxClientConn must be >= 1');
  }
  return { valid: errors.length === 0, errors };
}

export default {
  PGBOUNCER_MODES,
  PGBOUNCER_DEFAULTS,
  generatePgBouncerConfig,
  createPooledConnectionString,
  validatePgBouncerConfig
};
