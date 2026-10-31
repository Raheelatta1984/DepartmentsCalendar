import type {
  CalendarScopeMode,
  CalendarScopeSettings,
  Department,
  Entity,
  StoreState,
  Tenant,
} from '../types';

/* ------------------------------------------------------------------ */
/* Tenant isolation                                                    */
/*                                                                     */
/* The workspace snapshot can hold several tenants side by side (a      */
/* group of companies and an unrelated retail group, for example).      */
/* Every read path goes through this module so a tenant can only ever   */
/* see its own entities, sub-entities, departments, people, activities, */
/* timesheets, stand-ups, projects, capitalisation packs, calendar      */
/* connections, leave records and audit events.                         */
/*                                                                     */
/* Isolation is enforced twice:                                          */
/*   1. `scopeStateToTenant` is what the React store exposes to every    */
/*      screen — rows of other tenants never reach the browser UI.       */
/*   2. `mergeTenantState` writes a tenant-scoped edit back into the     */
/*      full snapshot, replacing only that tenant's rows and leaving     */
/*      every other tenant byte-for-byte untouched.                      */
/* ------------------------------------------------------------------ */

/** The tenant the portal opens on: Harris Farm Markets' IT department rollout. */
export const DEFAULT_TENANT_ID = 'tnt-harris-farm';
/** Fallback for legacy rows that predate tenancy. */
export const FALLBACK_TENANT_ID = 'tnt-meridian';

export const CALENDAR_SCOPE_LABELS: Record<CalendarScopeMode, string> = {
  single: 'Single department',
  multiple: 'Selected departments',
  all: 'All departments',
};

export const CALENDAR_SCOPE_HINTS: Record<CalendarScopeMode, string> = {
  single: 'One department uses the calendar — the default IT department set-up.',
  multiple: 'An explicit list of departments shares the calendar.',
  all: 'Every department in this tenant is on the calendar.',
};

export function tenantList(tenants: Tenant[] | undefined): Tenant[] {
  return (tenants ?? []).filter((tenant) => tenant.status !== 'archived');
}

export function findTenant(tenants: Tenant[] | undefined, tenantId: string | undefined): Tenant | undefined {
  if (!tenantId) return undefined;
  return (tenants ?? []).find((tenant) => tenant.id === tenantId);
}

/** Resolves the tenant to show, falling back to the default / first active tenant. */
export function resolveTenantId(tenants: Tenant[] | undefined, tenantId: string | undefined): string {
  const active = tenantList(tenants);
  if (tenantId && active.some((tenant) => tenant.id === tenantId)) return tenantId;
  if (active.some((tenant) => tenant.id === DEFAULT_TENANT_ID)) return DEFAULT_TENANT_ID;
  return active[0]?.id ?? '';
}

export function tenantDisplayName(tenant: Tenant | undefined, fallback = 'Orbit'): string {
  return tenant?.name ?? fallback;
}

/* ------------------------------------------------------------------ */
/* Indexes                                                             */
/* ------------------------------------------------------------------ */
export interface TenantIndex {
  /** entityId → tenantId */
  entityTenant: Map<string, string>;
  /** departmentId → tenantId */
  departmentTenant: Map<string, string>;
  /** employeeId → tenantId */
  employeeTenant: Map<string, string>;
}

/**
 * Builds the lookup used by every collection. A department inherits its
 * entity's tenant; a person inherits their department's tenant and falls
 * back to their own entity. That means a row can never be attributed to a
 * tenant it does not belong to, even if a reference is stale.
 */
export function buildTenantIndex(state: Pick<StoreState, 'entities' | 'departments' | 'employees'>): TenantIndex {
  const entityTenant = new Map<string, string>();
  state.entities.forEach((entity) => {
    if (entity.tenantId) entityTenant.set(entity.id, entity.tenantId);
  });
  const departmentTenant = new Map<string, string>();
  state.departments.forEach((department) => {
    const tenantId = entityTenant.get(department.entityId);
    if (tenantId) departmentTenant.set(department.id, tenantId);
  });
  const employeeTenant = new Map<string, string>();
  state.employees.forEach((employee) => {
    const tenantId = departmentTenant.get(employee.departmentId) ?? entityTenant.get(employee.entityId);
    if (tenantId) employeeTenant.set(employee.id, tenantId);
  });
  return { entityTenant, departmentTenant, employeeTenant };
}

export function tenantEntityIds(state: Pick<StoreState, 'entities'>, tenantId: string): string[] {
  return state.entities.filter((entity) => entity.tenantId === tenantId).map((entity) => entity.id);
}

export function tenantEntities(state: Pick<StoreState, 'entities'>, tenantId: string): Entity[] {
  return state.entities.filter((entity) => entity.tenantId === tenantId);
}

export function tenantDepartments(
  state: Pick<StoreState, 'entities' | 'departments'>,
  tenantId: string,
): Department[] {
  const ids = new Set(tenantEntityIds(state, tenantId));
  return state.departments.filter((department) => ids.has(department.entityId));
}

/** Root entity of a tenant (its group of companies). */
export function tenantRootEntity(state: Pick<StoreState, 'entities'>, tenantId: string): Entity | undefined {
  const entities = tenantEntities(state, tenantId);
  return entities.find((entity) => !entity.parentId) ?? entities[0];
}

export function tenantOfEmployee(index: TenantIndex, employeeId: string | undefined): string | undefined {
  return employeeId ? index.employeeTenant.get(employeeId) : undefined;
}

export function tenantOfDepartment(index: TenantIndex, departmentId: string | undefined): string | undefined {
  return departmentId ? index.departmentTenant.get(departmentId) : undefined;
}

/* ------------------------------------------------------------------ */
/* Calendar scope (master setting: one, several or all departments)    */
/* ------------------------------------------------------------------ */
/**
 * Departments the calendar covers for a tenant. The person's own
 * department is always included so nobody ends up locked out of their own
 * calendar, even when the master setting names a different department.
 */
export function calendarDepartmentIds(
  state: Pick<StoreState, 'entities' | 'departments'>,
  tenant: Tenant | undefined,
  ownDepartmentId?: string,
): string[] {
  const tenantDepts = tenant ? tenantDepartments(state, tenant.id) : state.departments;
  const tenantIds = new Set(tenantDepts.map((department) => department.id));
  const scope = tenant?.calendarScope;
  let ids: string[];
  if (!scope || scope.mode === 'all') ids = tenantDepts.map((department) => department.id);
  else {
    const chosen = (scope.departmentIds ?? []).filter((id) => tenantIds.has(id));
    ids = scope.mode === 'single' ? chosen.slice(0, 1) : chosen;
    // A mis-configured scope (or none selected yet) must not hide everything.
    if (!ids.length) ids = tenantDepts.map((department) => department.id);
  }
  if (ownDepartmentId && tenantIds.has(ownDepartmentId) && !ids.includes(ownDepartmentId)) {
    ids = [...ids, ownDepartmentId];
  }
  return ids;
}

export function describeCalendarScope(tenant: Tenant | undefined, departments: Department[]): string {
  if (!tenant) return 'All departments';
  if (tenant.calendarScope.mode === 'all') return `All ${departments.length} departments`;
  const named = departments.filter((department) => tenant.calendarScope.departmentIds.includes(department.id));
  if (!named.length) return 'All departments (no department selected yet)';
  const codes = named.map((department) => department.code).join(' · ');
  return tenant.calendarScope.mode === 'single' ? `Single department · ${codes}` : `${named.length} departments · ${codes}`;
}

/** Normalises a scope edited in Master setup so it can never select nothing. */
export function normaliseCalendarScope(
  scope: CalendarScopeSettings,
  tenantDepartmentIds: string[],
): CalendarScopeSettings {
  const allowed = new Set(tenantDepartmentIds);
  const chosen = Array.from(new Set((scope.departmentIds ?? []).filter((id) => allowed.has(id))));
  if (scope.mode === 'all') return { mode: 'all', departmentIds: chosen };
  if (scope.mode === 'single') return { mode: 'single', departmentIds: chosen.slice(0, 1) };
  return { mode: 'multiple', departmentIds: chosen };
}

/* ------------------------------------------------------------------ */
/* Reads — the tenant-scoped view                                      */
/* ------------------------------------------------------------------ */
/**
 * Returns only the rows owned by `tenantId`, in the exact shape the
 * screens expect. Holidays, countries, capitalisation policy, settings and
 * the tenant register itself are shared reference data.
 */
export function scopeStateToTenant(state: StoreState, tenantId: string): StoreState {
  const index = buildTenantIndex(state);
  const owned = (map: Map<string, string>, id: string | undefined) => (id ? map.get(id) === tenantId : false);

  const entities = state.entities.filter((entity) => (entity.tenantId ?? FALLBACK_TENANT_ID) === tenantId);
  const departments = state.departments.filter((department) => owned(index.departmentTenant, department.id));
  const employees = state.employees.filter((employee) => owned(index.employeeTenant, employee.id));

  const activities = state.activities.filter((activity) => owned(index.departmentTenant, activity.departmentId));
  const activityIds = new Set(activities.map((activity) => activity.id));
  const employeeIds = new Set(employees.map((employee) => employee.id));

  return {
    tenants: state.tenants ?? [],
    entities,
    departments,
    deliveryStreams: (state.deliveryStreams ?? []).filter((row) => owned(index.departmentTenant, row.departmentId)),
    designations: (state.designations ?? []).filter((row) => row.tenantId === tenantId),
    calendarShares: (state.calendarShares ?? []).filter((row) => employeeIds.has(row.ownerId)),
    workItems: (state.workItems ?? []).filter((row) => owned(index.departmentTenant, row.departmentId)),
    devopsImports: (state.devopsImports ?? []).filter((row) => owned(index.departmentTenant, row.departmentId)),
    employees,
    activities,
    timeEntries: state.timeEntries.filter((entry) => employeeIds.has(entry.employeeId)),
    holidays: state.holidays,
    countries: state.countries,
    escalations: state.escalations.filter((escalation) => owned(index.departmentTenant, escalation.departmentId)),
    connections: state.connections.filter((connection) => employeeIds.has(connection.employeeId)),
    syncJobs: state.syncJobs.filter((job) => activityIds.has(job.activityId)),
    standups: state.standups.filter((entry) => owned(index.departmentTenant, entry.departmentId)),
    leaves: (state.leaves ?? []).filter((leave) => employeeIds.has(leave.employeeId)),
    settings: state.settings,
    auditLog: (state.auditLog ?? []).filter(
      (entry) => !entry.tenantId || entry.tenantId === tenantId || owned(index.employeeTenant, entry.actorId),
    ),
    projects: (state.projects ?? []).filter((project) => owned(index.departmentTenant, project.departmentId)),
    capitalisation: state.capitalisation,
    capitalisationApprovals: (state.capitalisationApprovals ?? []).filter(
      (approval) => entities.some((entity) => entity.id === approval.entityId),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Writes — merge an edited tenant back into the full snapshot         */
/* ------------------------------------------------------------------ */
export function mergeTenantState(full: StoreState, edited: StoreState, tenantId: string): StoreState {
  const fullIndex = buildTenantIndex(full);
  const editedIndex = buildTenantIndex(edited);

  /**
   * Stable merge for one collection:
   *   • rows of other tenants are kept exactly as they were, in place;
   *   • rows of this tenant take the edited value, and disappear if the
   *     edit deleted them;
   *   • rows the edit created are prepended (the store prepends new rows).
   * A no-op save therefore produces a byte-identical snapshot, which keeps
   * the shared-sync dirty check and the conflict detection quiet.
   */
  const mergeOwned = <T extends { id: string }>(
    fullRows: T[],
    editedRows: T[],
    resolveFull: (row: T) => string | undefined,
    resolveEdited: (row: T) => string | undefined,
  ): T[] => {
    const editedValid = editedRows.filter((row) => {
      const owner = resolveEdited(row);
      return owner === tenantId || owner === undefined;
    });
    const editedById = new Map(editedValid.map((row) => [row.id, row]));
    const fullIds = new Set(fullRows.map((row) => row.id));
    const merged: T[] = [];
    fullRows.forEach((row) => {
      if (resolveFull(row) !== tenantId) {
        merged.push(row);
        return;
      }
      const next = editedById.get(row.id);
      if (next) merged.push(next);
    });
    const added = editedValid.filter((row) => !fullIds.has(row.id));
    return [...added, ...merged];
  };

  const data = {
    tenants: mergeTenantRegister(full.tenants ?? [], edited.tenants ?? []),
    entities: mergeOwned(full.entities, edited.entities, (row) => row.tenantId, (row) => row.tenantId),
    departments: mergeOwned(
      full.departments,
      edited.departments,
      (row) => fullIndex.departmentTenant.get(row.id),
      (row) => editedIndex.departmentTenant.get(row.id),
    ),
    deliveryStreams: mergeOwned(full.deliveryStreams ?? [], edited.deliveryStreams ?? [],
      (row) => fullIndex.departmentTenant.get(row.departmentId), (row) => editedIndex.departmentTenant.get(row.departmentId)),
    designations: mergeOwned(full.designations ?? [], edited.designations ?? [],
      (row) => row.tenantId, (row) => row.tenantId),
    calendarShares: mergeOwned(full.calendarShares ?? [], edited.calendarShares ?? [],
      (row) => fullIndex.employeeTenant.get(row.ownerId), (row) => editedIndex.employeeTenant.get(row.ownerId)),
    workItems: mergeOwned(full.workItems ?? [], edited.workItems ?? [],
      (row) => fullIndex.departmentTenant.get(row.departmentId), (row) => editedIndex.departmentTenant.get(row.departmentId)),
    devopsImports: mergeOwned(full.devopsImports ?? [], edited.devopsImports ?? [],
      (row) => fullIndex.departmentTenant.get(row.departmentId), (row) => editedIndex.departmentTenant.get(row.departmentId)),
    employees: mergeOwned(
      full.employees,
      edited.employees,
      (row) => fullIndex.employeeTenant.get(row.id),
      (row) => editedIndex.employeeTenant.get(row.id),
    ),
    activities: mergeOwned(
      full.activities,
      edited.activities,
      (row) => fullIndex.departmentTenant.get(row.departmentId),
      (row) => editedIndex.departmentTenant.get(row.departmentId),
    ),
    timeEntries: mergeOwned(
      full.timeEntries,
      edited.timeEntries,
      (row) => fullIndex.employeeTenant.get(row.employeeId),
      (row) => editedIndex.employeeTenant.get(row.employeeId),
    ),
    escalations: mergeOwned(
      full.escalations,
      edited.escalations,
      (row) => fullIndex.departmentTenant.get(row.departmentId),
      (row) => editedIndex.departmentTenant.get(row.departmentId),
    ),
    standups: mergeOwned(
      full.standups,
      edited.standups,
      (row) => fullIndex.departmentTenant.get(row.departmentId),
      (row) => editedIndex.departmentTenant.get(row.departmentId),
    ),
    projects: mergeOwned(
      full.projects ?? [],
      edited.projects ?? [],
      (row) => fullIndex.departmentTenant.get(row.departmentId),
      (row) => editedIndex.departmentTenant.get(row.departmentId),
    ),
    leaves: mergeOwned(
      full.leaves ?? [],
      edited.leaves ?? [],
      (row) => fullIndex.employeeTenant.get(row.employeeId),
      (row) => editedIndex.employeeTenant.get(row.employeeId),
    ),
    connections: mergeOwned(
      full.connections,
      edited.connections,
      (row) => fullIndex.employeeTenant.get(row.employeeId),
      (row) => editedIndex.employeeTenant.get(row.employeeId),
    ),
    syncJobs: mergeOwned(
      full.syncJobs,
      edited.syncJobs,
      (row) => {
        const activity = full.activities.find((item) => item.id === row.activityId);
        return activity ? fullIndex.departmentTenant.get(activity.departmentId) : undefined;
      },
      (row) => {
        const activity = edited.activities.find((item) => item.id === row.activityId);
        return activity ? editedIndex.departmentTenant.get(activity.departmentId) : undefined;
      },
    ),
    capitalisationApprovals: mergeOwned(
      full.capitalisationApprovals ?? [],
      edited.capitalisationApprovals ?? [],
      (row) => full.entities.find((entity) => entity.id === row.entityId)?.tenantId,
      (row) => edited.entities.find((entity) => entity.id === row.entityId)?.tenantId,
    ),
    // Legacy audit rows without a tenant stay global so no history is lost.
    auditLog: mergeAuditLog(full.auditLog ?? [], edited.auditLog ?? [], tenantId, fullIndex),
    // Shared reference data belongs to the workspace, not to a tenant.
    holidays: edited.holidays,
    countries: edited.countries,
    capitalisation: edited.capitalisation,
    settings: edited.settings,
  };

  // Spreading `full` first keeps a canonical key order, so a save that
  // changed nothing is byte-identical to what was already stored.
  return { ...full, ...data };
}

/** The tenant register itself is shared, so both sides must be preserved. */
function mergeTenantRegister(full: Tenant[], edited: Tenant[]): Tenant[] {
  const byId = new Map(full.map((tenant) => [tenant.id, tenant]));
  const merged = full.map((tenant) => edited.find((row) => row.id === tenant.id) ?? tenant);
  return [...merged, ...edited.filter((tenant) => !byId.has(tenant.id))];
}

/**
 * Audit rows are attributed to the actor's tenant; legacy rows without a
 * tenant stay global so no history is ever silently dropped.
 */
function mergeAuditLog(
  full: AuditRow[],
  edited: AuditRow[],
  tenantId: string,
  fullIndex: TenantIndex,
): AuditRow[] {
  const ownerOf = (row: AuditRow, index: TenantIndex) =>
    row.tenantId ?? (row.actorId ? index.employeeTenant.get(row.actorId) : undefined);
  const valid = (row: AuditRow) => {
    const owner = ownerOf(row, fullIndex);
    return owner === tenantId || owner === undefined;
  };
  const editedValid = edited.filter((row) => {
    const owner = ownerOf(row, fullIndex);
    return owner === tenantId || owner === undefined || !row.tenantId;
  });
  const editedById = new Map(editedValid.map((row) => [row.id, row]));
  const fullIds = new Set(full.map((row) => row.id));
  const retained: AuditRow[] = [];
  full.forEach((row) => {
    if (!valid(row)) {
      retained.push(row);
      return;
    }
    const next = editedById.get(row.id);
    if (next) retained.push(next);
  });
  const added = editedValid.filter((row) => !fullIds.has(row.id));
  return [...added, ...retained];
}

type AuditRow = StoreState['auditLog'][number];

/* ------------------------------------------------------------------ */
/* Tenant lifecycle                                                    */
/* ------------------------------------------------------------------ */
export function tenantStats(state: StoreState, tenantId: string) {
  const entities = tenantEntities(state, tenantId);
  const departments = tenantDepartments(state, tenantId);
  const departmentIds = new Set(departments.map((department) => department.id));
  const employees = state.employees.filter((employee) => departmentIds.has(employee.departmentId));
  return {
    entities: entities.length,
    companies: entities.filter((entity) => entity.type === 'company').length,
    subCompanies: entities.filter((entity) => entity.type === 'sub_company').length,
    departments: departments.length,
    people: employees.length,
  };
}

/**
 * Removes a tenant and everything it owns. Returns a new full workspace.
 * The caller must refuse to delete the last tenant.
 */
export function removeTenant(state: StoreState, tenantId: string): StoreState {
  const scoped = scopeStateToTenant(state, tenantId);
  const entities = new Set(scoped.entities.map((entity) => entity.id));
  const departments = new Set(scoped.departments.map((department) => department.id));
  const employees = new Set(scoped.employees.map((employee) => employee.id));
  const activities = new Set(scoped.activities.map((activity) => activity.id));
  const projects = new Set((scoped.projects ?? []).map((project) => project.id));

  const tenants = (state.tenants ?? []).filter((tenant) => tenant.id !== tenantId);
  const nextTenantId = resolveTenantId(tenants, tenants[0]?.id);
  const remainingEmployees = state.employees.filter((employee) => !employees.has(employee.id));

  return {
    ...state,
    tenants,
    entities: state.entities.filter((entity) => !entities.has(entity.id)),
    departments: state.departments.filter((department) => !departments.has(department.id)),
    deliveryStreams: (state.deliveryStreams ?? []).filter((row) => !departments.has(row.departmentId)),
    designations: (state.designations ?? []).filter((row) => row.tenantId !== tenantId),
    calendarShares: (state.calendarShares ?? []).filter((row) => !employees.has(row.ownerId) && !employees.has(row.employeeId ?? '')),
    workItems: (state.workItems ?? []).filter((row) => !departments.has(row.departmentId)),
    devopsImports: (state.devopsImports ?? []).filter((row) => !departments.has(row.departmentId)),
    employees: remainingEmployees,
    activities: state.activities.filter((activity) => !activities.has(activity.id)),
    timeEntries: state.timeEntries.filter((entry) => !employees.has(entry.employeeId)),
    escalations: state.escalations.filter((escalation) => !departments.has(escalation.departmentId)),
    connections: state.connections.filter((connection) => !employees.has(connection.employeeId)),
    syncJobs: state.syncJobs.filter((job) => !activities.has(job.activityId)),
    standups: state.standups.filter((entry) => !departments.has(entry.departmentId)),
    leaves: (state.leaves ?? []).filter((leave) => !employees.has(leave.employeeId)),
    projects: (state.projects ?? []).filter((project) => !projects.has(project.id)),
    capitalisationApprovals: (state.capitalisationApprovals ?? []).filter(
      (approval) => !entities.has(approval.entityId),
    ),
    auditLog: (state.auditLog ?? []).filter((entry) => !entry.tenantId || entry.tenantId !== tenantId),
    settings: {
      ...state.settings,
      activeTenantId: state.settings.activeTenantId === tenantId ? nextTenantId : state.settings.activeTenantId,
      activeUserId:
        state.settings.activeTenantId === tenantId && !remainingEmployees.some((e) => e.id === state.settings.activeUserId)
          ? remainingEmployees[0]?.id ?? state.settings.activeUserId
          : state.settings.activeUserId,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Calendar-scope view (master setting: one / several / all departments) */
/* ------------------------------------------------------------------ */
/**
 * Cuts a tenant-scoped state down to the departments the calendar is
 * implemented for. Everything derived from a department (people,
 * activities, timesheets, stand-ups, projects, PTO, approvals, escalations,
 * connector health) is cut with it, so a single-department roll-out behaves
 * exactly like a single-department application.
 */
export function scopeStateToDepartments(state: StoreState, departmentIds: string[]): StoreState {
  const allowed = new Set(departmentIds);
  if (!allowed.size) return state;
  const departments = state.departments.filter((department) => allowed.has(department.id));
  const employeeIds = new Set(
    state.employees.filter((employee) => allowed.has(employee.departmentId)).map((employee) => employee.id),
  );
  const activityIds = new Set(
    state.activities.filter((activity) => allowed.has(activity.departmentId)).map((activity) => activity.id),
  );
  const entityIds = new Set<string>();
  departments.forEach((department) => {
    entityIds.add(department.entityId);
    let current = state.entities.find((entity) => entity.id === department.entityId);
    const seen = new Set<string>();
    while (current?.parentId && !seen.has(current.id)) {
      seen.add(current.id);
      entityIds.add(current.parentId);
      current = state.entities.find((entity) => entity.id === current!.parentId);
    }
  });

  return {
    ...state,
    entities: state.entities.filter((entity) => entityIds.has(entity.id)),
    departments,
    deliveryStreams: (state.deliveryStreams ?? []).filter((row) => allowed.has(row.departmentId)),
    designations: state.designations ?? [],
    calendarShares: (state.calendarShares ?? []).filter((row) => employeeIds.has(row.ownerId)),
    workItems: (state.workItems ?? []).filter((row) => allowed.has(row.departmentId)),
    devopsImports: (state.devopsImports ?? []).filter((row) => allowed.has(row.departmentId)),
    employees: state.employees.filter((employee) => employeeIds.has(employee.id)),
    activities: state.activities.filter((activity) => allowed.has(activity.departmentId)),
    timeEntries: state.timeEntries.filter((entry) => employeeIds.has(entry.employeeId)),
    escalations: state.escalations.filter((escalation) => allowed.has(escalation.departmentId)),
    connections: state.connections.filter((connection) => employeeIds.has(connection.employeeId)),
    syncJobs: state.syncJobs.filter((job) => activityIds.has(job.activityId)),
    standups: state.standups.filter((entry) => allowed.has(entry.departmentId)),
    leaves: (state.leaves ?? []).filter((leave) => employeeIds.has(leave.employeeId)),
    projects: (state.projects ?? []).filter((project) => allowed.has(project.departmentId)),
    capitalisationApprovals: (state.capitalisationApprovals ?? []).filter((approval) =>
      state.departments.some((department) => allowed.has(department.id) && department.entityId === approval.entityId),
    ),
  };
}
