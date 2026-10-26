import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Activity,
  AuditEntry,
  CalendarConnection,
  CalendarProvider,
  CalendarScopeSettings,
  Department,
  CapitalisationApproval,
  Employee,
  Entity,
  Escalation,
  Holiday,
  LeaveRequest,
  LeaveStatus,
  Project,
  Settings,
  StandupEntry,
  StoreState,
  SupportRequest,
  SupportRequestStatus,
  SyncJob,
  Tenant,
  TimeEntry,
} from './types';
import { createSeedState } from './data/seed';
import { RETAIL_CAPITALISATION_POLICY, withRetailSample } from './data/retail-seed';
import { buildApproval, monthScope, capitalisationReport } from './lib/capitalisation';
import { buildHolidayDataset } from './data/countries';
import { getScope, type Scope } from './lib/permissions';
import {
  FALLBACK_TENANT_ID,
  buildTenantIndex,
  calendarDepartmentIds as resolveCalendarDepartmentIds,
  findTenant,
  mergeTenantState,
  normaliseCalendarScope,
  removeTenant,
  resolveTenantId,
  scopeStateToDepartments,
  scopeStateToTenant,
  tenantDepartments,
} from './lib/tenants';
import { leaveBreakdown } from './lib/leave';
import { DEFAULT_TENANT_ID, HARBOURLINE_TENANT_ID, MERIDIAN_TENANT_ID, TENANTS } from './data/tenant-seed';
import { fromSharedState, rememberPersona, rememberTenant } from './lib/workspace-api';
import { useWorkspacePersistence, type SharedConnection, type WorkspacePersistence } from './lib/useWorkspacePersistence';

const STORAGE_KEY = 'orbit.portal.state.v1';

/**
 * Adds tenancy, leave, capitalisation and project defaults without touching
 * any existing record. Older snapshots (and older browser caches) are
 * attributed to a tenant by entity id so isolation is never ambiguous.
 */
export function normaliseState(state: StoreState): StoreState {
  const tenants = Array.isArray(state.tenants) && state.tenants.length ? state.tenants : TENANTS;
  const fallbackTenantId = tenants.some((tenant) => tenant.id === DEFAULT_TENANT_ID)
    ? DEFAULT_TENANT_ID
    : tenants[0].id;
  const entities = (state.entities ?? []).map((entity) => ({
    ...entity,
    tenantId:
      entity.tenantId ??
      (entity.id.startsWith('ent-hra')
        ? HARBOURLINE_TENANT_ID
        : tenants.some((tenant) => tenant.id === MERIDIAN_TENANT_ID)
          ? MERIDIAN_TENANT_ID
          : fallbackTenantId),
  }));
  const activeTenantId = resolveTenantId(tenants, state.settings?.activeTenantId);
  const tenant = tenants.find((row) => row.id === activeTenantId);
  const tenantDeptIds = new Set(
    (state.departments ?? [])
      .filter((department) => entities.some((entity) => entity.id === department.entityId && entity.tenantId === activeTenantId))
      .map((department) => department.id),
  );
  const activeUser =
    state.employees?.find((employee) => employee.id === state.settings?.activeUserId && tenantDeptIds.has(employee.departmentId)) ??
    state.employees?.find((employee) => employee.role === 'department_head' && employee.departmentId === tenant?.calendarScope.departmentIds[0]) ??
    state.employees?.find((employee) => tenantDeptIds.has(employee.departmentId)) ??
    state.employees?.[0];

  return {
    ...state,
    tenants,
    entities,
    projects: Array.isArray(state.projects) ? state.projects : [],
    capitalisation: state.capitalisation ?? RETAIL_CAPITALISATION_POLICY,
    capitalisationApprovals: Array.isArray(state.capitalisationApprovals) ? state.capitalisationApprovals : [],
    standups: Array.isArray(state.standups) ? state.standups : [],
    leaves: Array.isArray(state.leaves) ? state.leaves : [],
    settings: {
      ...state.settings,
      activeTenantId,
      activeUserId: activeUser?.id ?? state.settings?.activeUserId ?? '',
    },
  };
}

function loadState(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed = JSON.parse(raw) as StoreState;
    if (!parsed.employees?.length || !parsed.activities || !parsed.settings) return createSeedState();
    // heals older caches when the demo schema evolves
    if (!parsed.syncJobs || !parsed.connections || !parsed.escalations) return createSeedState();
    if (!parsed.projects || !parsed.capitalisation) return createSeedState();
    if (!parsed.tenants) return createSeedState();
    return normaliseState(parsed);
  } catch {
    return createSeedState();
  }
}

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

interface StoreContextValue {
  /** The active tenant only — never another tenant's entities or people. */
  state: StoreState;
  /** The active tenant cut down to the departments the calendar is implemented for. */
  scopedState: StoreState;
  /** All tenants in the workspace (register only — no rows of other tenants). */
  tenants: Tenant[];
  tenant: Tenant | undefined;
  calendarScope: CalendarScopeSettings;
  calendarDepartmentIds: string[];
  workspace: WorkspacePersistence;
  scope: Scope;
  save: (next: StoreState | ((prev: StoreState) => StoreState), audit?: Omit<AuditEntry, 'id' | 'at' | 'actorId'>) => void;
  setActiveUser: (id: string) => void;
  setActiveTenant: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setCalendarScope: (scope: CalendarScopeSettings) => void;
  upsertTenant: (tenant: Tenant) => void;
  deleteTenant: (id: string) => void;
  submitLeave: (input: {
    employeeId: string;
    startDate: string;
    endDate: string;
    type: LeaveRequest['type'];
    reason: string;
    delegateId: string | null;
  }) => LeaveRequest | null;
  decideLeave: (id: string, decision: Extract<LeaveStatus, 'approved' | 'rejected'>, note: string) => void;
  cancelLeave: (id: string) => void;
  deleteLeave: (id: string) => void;
  upsertActivity: (activity: Activity) => void;
  deleteActivity: (id: string) => void;
  updateActivityStatus: (id: string, status: Activity['status'], progress?: number) => void;
  toggleSubtask: (activityId: string, subtaskId: string) => void;
  upsertEmployee: (employee: Employee) => void;
  deleteEmployee: (id: string) => void;
  upsertDepartment: (department: Department) => void;
  deleteDepartment: (id: string) => void;
  upsertEntity: (entity: Entity) => void;
  deleteEntity: (id: string) => void;
  addTimeEntry: (entry: TimeEntry) => void;
  deleteTimeEntry: (id: string) => void;
  toggleEntryApproved: (id: string) => void;
  addHoliday: (holiday: Holiday) => void;
  deleteHoliday: (id: string) => void;
  generateHolidays: (countryCode: string, year: number) => number;
  upsertEscalation: (escalation: Escalation) => void;
  setEscalationStatus: (id: string, status: Escalation['status']) => void;
  upsertStandup: (entry: StandupEntry) => void;
  deleteStandup: (id: string) => void;
  setSupportRequestStatus: (entryId: string, requestId: string, status: SupportRequestStatus) => void;
  toggleStandupAction: (entryId: string, actionId: string) => void;
  connectCalendar: (connection: CalendarConnection) => void;
  disconnectCalendar: (employeeId: string, provider: CalendarProvider) => void;
  pushToCalendars: (activityId: string, providers?: CalendarProvider[]) => void;
  setActivitySync: (activityId: string, provider: CalendarProvider, enabled: boolean) => void;
  upsertProject: (project: Project) => void;
  submitCapitalisation: (entityId: string, departmentId: string, month: string) => CapitalisationApproval;
  decideCapitalisation: (id: string, status: 'approved' | 'rejected', note: string) => void;
  loadRetailSample: () => void;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children, shared }: { children: React.ReactNode; shared?: SharedConnection }) {
  // `fullState` holds every tenant in the workspace. Screens never see it:
  // they receive `state` (the active tenant) or `scopedState` (the tenant cut
  // to the departments the calendar is implemented for).
  const [fullState, setFullState] = useState<StoreState>(() =>
    normaliseState(shared ? fromSharedState(shared.snapshot.state) : loadState()),
  );
  const workspace = useWorkspacePersistence(fullState, setFullState, shared);
  const writeTimer = useRef<number | null>(null);

  const tenants = useMemo(() => fullState.tenants ?? [], [fullState.tenants]);
  const activeTenantId = resolveTenantId(tenants, fullState.settings.activeTenantId);
  const tenant = findTenant(tenants, activeTenantId);

  /* The hard isolation boundary: another tenant's rows are dropped here,
     before any screen, hook, calculation or export can read them. */
  const state = useMemo(() => scopeStateToTenant(fullState, activeTenantId), [fullState, activeTenantId]);

  const calendarScope = useMemo<CalendarScopeSettings>(
    () => tenant?.calendarScope ?? { mode: 'all', departmentIds: [] },
    [tenant],
  );
  const activeUserId = state.settings.activeUserId;
  const ownDepartmentId = state.employees.find((employee) => employee.id === activeUserId)?.departmentId;
  const calendarDepartmentIds = useMemo(
    () => resolveCalendarDepartmentIds(state, tenant, ownDepartmentId),
    [state, tenant, ownDepartmentId],
  );

  /* Master setting in action: single / multiple / all departments. */
  const scopedState = useMemo(
    () => scopeStateToDepartments(state, calendarDepartmentIds),
    [state, calendarDepartmentIds],
  );

  useEffect(() => {
    if (shared) {
      // Shared company data is never cached in localStorage. Only this device's
      // persona and tenant preferences are local; they change nobody else's view.
      rememberPersona(fullState.settings.activeUserId);
      rememberTenant(activeTenantId);
      return;
    }
    if (writeTimer.current) window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => {
      try {
        // The demo cache holds every tenant; screens only ever read one.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fullState));
      } catch {
        /* storage full — the session still works in memory */
      }
    }, 250);
    return () => {
      if (writeTimer.current) window.clearTimeout(writeTimer.current);
    };
  }, [fullState, shared]);

  const scope = useMemo(() => getScope(scopedState, activeUserId), [scopedState, activeUserId]);
  const latestStateRef = useRef(state);
  latestStateRef.current = state;

  /**
   * Every edit is expressed against the active tenant and merged back into
   * the full snapshot, so a save can only ever replace that tenant's rows.
   */
  const save = useCallback<StoreContextValue['save']>((next, audit) => {
    setFullState((prevFull) => {
      const prevTenantId = resolveTenantId(prevFull.tenants, prevFull.settings.activeTenantId);
      const prevScoped = scopeStateToTenant(prevFull, prevTenantId);
      const resolved = typeof next === 'function' ? next(prevScoped) : next;
      if (!audit) return mergeTenantState(prevFull, resolved, prevTenantId);
      const entry: AuditEntry = {
        id: uid('aud'),
        tenantId: prevTenantId,
        at: new Date().toISOString(),
        actorId: resolved.settings.activeUserId,
        action: audit.action,
        detail: audit.detail,
      };
      return mergeTenantState(
        prevFull,
        { ...resolved, auditLog: [entry, ...resolved.auditLog].slice(0, 250) },
        prevTenantId,
      );
    });
  }, []);

  const queueSync = useCallback(
    (prev: StoreState, activity: Activity, action: SyncJob['action'], providers: CalendarProvider[]) => {
      const jobs: SyncJob[] = providers.map((provider) => ({
        id: uid('job'),
        activityId: activity.id,
        provider,
        action,
        status: 'synced',
        at: new Date().toISOString(),
        message:
          action === 'delete'
            ? `Removal sent to ${provider === 'outlook' ? 'Microsoft Graph' : 'Google Calendar API'}`
            : `${provider === 'outlook' ? 'Microsoft Graph' : 'Google Calendar API'} accepted the event payload (sandbox connector)`,
      }));
      const connections = prev.connections.map((c) =>
        providers.includes(c.provider) && c.employeeId === activity.assigneeId && c.status === 'connected'
          ? { ...c, lastSync: new Date().toISOString() }
          : c,
      );
      return {
        ...prev,
        connections,
        syncJobs: [...jobs, ...prev.syncJobs].slice(0, 400),
      };
    },
    [],
  );

  const value = useMemo<StoreContextValue>(() => {
    return {
      state,
      scopedState,
      tenants,
      tenant,
      calendarScope,
      calendarDepartmentIds,
      workspace,
      scope,
      save,
      setActiveUser: (id) =>
        save((prev) => {
          const employee = prev.employees.find((row) => row.id === id);
          // Switching persona can never jump tenant: the person must belong
          // to the tenant on screen.
          if (!employee) return prev;
          return { ...prev, settings: { ...prev.settings, activeUserId: id } };
        }),
      setActiveTenant: (id) =>
        save(
          (prev) => {
            const target = prev.tenants.find((row) => row.id === id);
            if (!target) return prev;
            const targetState = scopeStateToTenant(prev, id);
            const current = prev.employees.find((row) => row.id === prev.settings.activeUserId);
            const currentDept = current ? prev.departments.find((department) => department.id === current.departmentId) : undefined;
            const currentEntity = currentDept ? prev.entities.find((entity) => entity.id === currentDept.entityId) : undefined;
            const keepPersona = currentEntity?.tenantId === id;
            const fallback =
              targetState.employees.find((employee) => employee.id === prev.settings.activeUserId) ??
              targetState.employees.find((employee) => employee.departmentId === target.calendarScope.departmentIds[0]) ??
              targetState.employees.find((employee) => employee.role === 'department_head') ??
              targetState.employees.find((employee) => employee.role === 'ceo') ??
              targetState.employees[0];
            return {
              ...prev,
              settings: {
                ...prev.settings,
                activeTenantId: id,
                activeUserId: keepPersona ? prev.settings.activeUserId : fallback?.id ?? prev.settings.activeUserId,
              },
            };
          },
          { action: 'Tenant switched', detail: id },
        ),
      setCalendarScope: (nextScope) =>
        save(
          (prev) => {
            const tenantRow = prev.tenants.find((row) => row.id === prev.settings.activeTenantId);
            if (!tenantRow) return prev;
            const tenantDeptIds = tenantDepartments(prev, tenantRow.id).map((department) => department.id);
            const calendarScopeNext = normaliseCalendarScope(nextScope, tenantDeptIds);
            return {
              ...prev,
              tenants: prev.tenants.map((row) =>
                row.id === tenantRow.id ? { ...row, calendarScope: calendarScopeNext } : row,
              ),
            };
          },
          { action: 'Calendar scope updated', detail: `${nextScope.mode} · ${nextScope.departmentIds.length} departments` },
        ),
      upsertTenant: (nextTenant) =>
        save(
          (prev) => {
            const exists = prev.tenants.some((row) => row.id === nextTenant.id);
            return {
              ...prev,
              tenants: exists
                ? prev.tenants.map((row) => (row.id === nextTenant.id ? nextTenant : row))
                : [...prev.tenants, nextTenant],
            };
          },
          { action: 'Tenant saved', detail: `${nextTenant.code} · ${nextTenant.name}` },
        ),
      deleteTenant: (id) =>
        save(
          (prev) => {
            // A workspace always keeps at least one tenant.
            if (prev.tenants.length <= 1) return prev;
            return removeTenant(prev, id);
          },
          { action: 'Tenant removed', detail: id },
        ),
      updateSettings: (patch) =>
        save(
          (prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }),
          { action: 'Settings updated', detail: Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ') },
        ),
      upsertActivity: (activity) =>
        save(
          (prev) => {
            const exists = prev.activities.some((a) => a.id === activity.id);
            const activities = exists
              ? prev.activities.map((a) => (a.id === activity.id ? activity : a))
              : [activity, ...prev.activities];
            const providers: CalendarProvider[] = [];
            if (activity.sync.outlook) providers.push('outlook');
            if (activity.sync.google) providers.push('google');
            const withSync = queueSync(prev, activity, exists ? 'update' : 'create', providers);
            return { ...withSync, activities };
          },
          { action: 'Activity saved', detail: '' },
        ),
      deleteActivity: (id) =>
        save(
          (prev) => {
            const activity = prev.activities.find((a) => a.id === id);
            if (!activity) return prev;
            const providers: CalendarProvider[] = [];
            if (activity.sync.outlook) providers.push('outlook');
            if (activity.sync.google) providers.push('google');
            const withSync = queueSync(prev, activity, 'delete', providers);
            return {
              ...withSync,
              activities: prev.activities.filter((a) => a.id !== id),
              timeEntries: prev.timeEntries.filter((t) => t.activityId !== id),
            };
          },
          { action: 'Activity deleted', detail: id },
        ),
      updateActivityStatus: (id, status, progress) =>
        save(
          (prev) => {
            const activities = prev.activities.map((a) =>
              a.id === id
                ? {
                    ...a,
                    status,
                    progress:
                      status === 'completed'
                        ? 100
                        : typeof progress === 'number'
                          ? progress
                          : status === 'not_started'
                            ? 0
                            : a.progress,
                  }
                : a,
            );
            const activity = activities.find((a) => a.id === id);
            return activity ? { ...prev, activities } : prev;
          },
          { action: 'Activity status changed', detail: `${id} → ${status}` },
        ),
      toggleSubtask: (activityId, subtaskId) =>
        save((prev) => ({
          ...prev,
          activities: prev.activities.map((a) => {
            if (a.id !== activityId) return a;
            const subtasks = a.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s));
            const total = subtasks.reduce((sum, s) => sum + s.plannedHours, 0) || 1;
            const done = subtasks.filter((s) => s.done).reduce((sum, s) => sum + s.plannedHours, 0);
            const progress = Math.min(100, Math.round((done / total) * 100));
            return {
              ...a,
              subtasks,
              progress,
              status: progress === 100 ? 'completed' : a.status === 'not_started' && progress > 0 ? 'in_progress' : a.status,
            };
          }),
        })),
      upsertEmployee: (employee) =>
        save(
          (prev) => ({
            ...prev,
            employees: prev.employees.some((e) => e.id === employee.id)
              ? prev.employees.map((e) => (e.id === employee.id ? employee : e))
              : [...prev.employees, employee],
          }),
          { action: 'Employee saved', detail: employee.name },
        ),
      deleteEmployee: (id) =>
        save(
          (prev) => ({
            ...prev,
            employees: prev.employees.filter((e) => e.id !== id),
            settings:
              prev.settings.activeUserId === id ? { ...prev.settings, activeUserId: prev.employees[0]?.id ?? id } : prev.settings,
          }),
          { action: 'Employee removed', detail: id },
        ),
      upsertDepartment: (department) =>
        save(
          (prev) => ({
            ...prev,
            departments: prev.departments.some((d) => d.id === department.id)
              ? prev.departments.map((d) => (d.id === department.id ? department : d))
              : [...prev.departments, department],
          }),
          { action: 'Department saved', detail: department.name },
        ),
      deleteDepartment: (id) =>
        save(
          (prev) => ({
            ...prev,
            departments: prev.departments.filter((d) => d.id !== id),
            activities: prev.activities.filter((a) => a.departmentId !== id),
          }),
          { action: 'Department removed', detail: id },
        ),
      upsertEntity: (entity) =>
        save(
          (prev) => ({
            ...prev,
            entities: prev.entities.some((e) => e.id === entity.id)
              ? prev.entities.map((e) => (e.id === entity.id ? entity : e))
              : [...prev.entities, entity],
          }),
          { action: 'Entity saved', detail: entity.name },
        ),
      deleteEntity: (id) =>
        save(
          (prev) => ({
            ...prev,
            entities: prev.entities.filter((e) => e.id !== id),
            departments: prev.departments.filter((d) => d.entityId !== id),
            employees: prev.employees.filter((e) => e.entityId !== id),
            activities: prev.activities.filter((a) => a.entityId !== id),
          }),
          { action: 'Entity removed', detail: id },
        ),
      addTimeEntry: (entry) =>
        save(
          (prev) => ({ ...prev, timeEntries: [entry, ...prev.timeEntries] }),
          { action: 'Time logged', detail: `${entry.hours}h on ${entry.date}` },
        ),
      deleteTimeEntry: (id) =>
        save((prev) => ({ ...prev, timeEntries: prev.timeEntries.filter((t) => t.id !== id) }), {
          action: 'Time entry deleted',
          detail: id,
        }),
      toggleEntryApproved: (id) =>
        save((prev) => ({
          ...prev,
          timeEntries: prev.timeEntries.map((t) => (t.id === id ? { ...t, approved: !t.approved } : t)),
        })),
      addHoliday: (holiday) =>
        save((prev) => ({ ...prev, holidays: [...prev.holidays, holiday] }), {
          action: 'Holiday added',
          detail: `${holiday.date} · ${holiday.name}`,
        }),
      deleteHoliday: (id) =>
        save((prev) => ({ ...prev, holidays: prev.holidays.filter((h) => h.id !== id) }), {
          action: 'Holiday removed',
          detail: id,
        }),
      generateHolidays: (countryCode, year) => {
        const existing = new Set(
          state.holidays.filter((h) => h.countryCode === countryCode).map((h) => h.date),
        );
        const generated = buildHolidayDataset([year], [countryCode]).filter(
          (h) => h.type === 'public_holiday' && !existing.has(h.date),
        );
        if (generated.length) {
          save(
            (prev) => {
              const known = new Set(prev.holidays.filter((h) => h.countryCode === countryCode).map((h) => h.date));
              return {
                ...prev,
                holidays: [...prev.holidays, ...generated.filter((h) => !known.has(h.date))],
              };
            },
            { action: 'Holiday calendar generated', detail: `${countryCode} ${year} · ${generated.length} days` },
          );
        }
        return generated.length;
      },
      upsertEscalation: (escalation) =>
        save(
          (prev) => ({
            ...prev,
            escalations: prev.escalations.some((e) => e.id === escalation.id)
              ? prev.escalations.map((e) => (e.id === escalation.id ? escalation : e))
              : [escalation, ...prev.escalations],
          }),
          { action: 'Escalation raised', detail: `${escalation.departmentId} · score ${escalation.score}` },
        ),
      setEscalationStatus: (id, status) =>
        save(
          (prev) => ({
            ...prev,
            escalations: prev.escalations.map((e) => (e.id === id ? { ...e, status } : e)),
          }),
          { action: 'Escalation updated', detail: `${id} → ${status}` },
        ),
      upsertStandup: (entry) =>
        save(
          (prev) => {
            // One stand-up per member per working day — re-saves replace that row.
            const duplicate = prev.standups.find(
              (row) => row.id === entry.id || (row.date === entry.date && row.employeeId === entry.employeeId),
            );
            const standups = duplicate
              ? prev.standups.map((row) => (row.id === duplicate.id ? entry : row))
              : [entry, ...prev.standups];
            return { ...prev, standups };
          },
          {
            action: entry.status === 'submitted' ? 'Stand-up submitted' : 'Stand-up draft saved',
            detail: `${entry.date} · ${entry.employeeId}`,
          },
        ),
      deleteStandup: (id) =>
        save(
          (prev) => ({ ...prev, standups: prev.standups.filter((row) => row.id !== id) }),
          { action: 'Stand-up deleted', detail: id },
        ),
      setSupportRequestStatus: (entryId, requestId, status) =>
        save(
          (prev) => ({
            ...prev,
            standups: prev.standups.map((row) =>
              row.id !== entryId
                ? row
                : {
                    ...row,
                    supportRequests: row.supportRequests.map((request: SupportRequest) =>
                      request.id !== requestId
                        ? request
                        : {
                            ...request,
                            status,
                            resolvedAt: status === 'resolved' ? new Date().toISOString() : null,
                          },
                    ),
                  },
            ),
          }),
          { action: 'Support request updated', detail: `${requestId} → ${status}` },
        ),
      toggleStandupAction: (entryId, actionId) =>
        save((prev) => ({
          ...prev,
          standups: prev.standups.map((row) =>
            row.id !== entryId
              ? row
              : {
                  ...row,
                  actionItems: row.actionItems.map((action) =>
                    action.id === actionId
                      ? { ...action, status: action.status === 'done' ? 'open' : 'done' }
                      : action,
                  ),
                },
          ),
        })),
      connectCalendar: (connection) =>
        save(
          (prev) => {
            const others = prev.connections.filter(
              (c) => !(c.employeeId === connection.employeeId && c.provider === connection.provider),
            );
            return { ...prev, connections: [...others, connection] };
          },
          { action: 'Calendar connected', detail: `${connection.provider} · ${connection.accountEmail}` },
        ),
      disconnectCalendar: (employeeId, provider) =>
        save(
          (prev) => ({
            ...prev,
            connections: prev.connections.map((c) =>
              c.employeeId === employeeId && c.provider === provider
                ? { ...c, status: 'disconnected', lastSync: null }
                : c,
            ),
          }),
          { action: 'Calendar disconnected', detail: `${employeeId} · ${provider}` },
        ),
      pushToCalendars: (activityId, providers) =>
        save((prev) => {
          const activity = prev.activities.find((a) => a.id === activityId);
          if (!activity) return prev;
          const list: CalendarProvider[] = providers ?? [
            ...(activity.sync.outlook ? (['outlook'] as CalendarProvider[]) : []),
            ...(activity.sync.google ? (['google'] as CalendarProvider[]) : []),
          ];
          return queueSync(prev, activity, 'update', list);
        }),
      setActivitySync: (activityId, provider, enabled) =>
        save((prev) => ({
          ...prev,
          activities: prev.activities.map((a) =>
            a.id === activityId ? { ...a, sync: { ...a.sync, [provider]: enabled } } : a,
          ),
        })),
      submitLeave: (input) => {
        const snapshot = normaliseState(latestStateRef.current);
        const employee = snapshot.employees.find((row) => row.id === input.employeeId);
        if (!employee) return null;
        const breakdown = leaveBreakdown(snapshot, employee, input.startDate, input.endDate);
        const now = new Date().toISOString();
        const leave: LeaveRequest = {
          id: uid('lv'),
          employeeId: employee.id,
          departmentId: employee.departmentId,
          entityId: employee.entityId,
          startDate: input.startDate,
          endDate: input.endDate,
          hours: breakdown.hours,
          workingDays: breakdown.workingDays,
          publicHolidayDays: breakdown.publicHolidayDays,
          publicHolidayHours: breakdown.publicHolidayHours,
          type: input.type,
          reason: input.reason,
          status: 'pending',
          delegateId: input.delegateId,
          submittedAt: now,
          decidedById: null,
          decidedAt: null,
          decisionNote: '',
          createdAt: now,
          updatedAt: now,
        };
        save(
          (prev) => ({ ...prev, leaves: [leave, ...(prev.leaves ?? [])] }),
          {
            action: 'Leave requested',
            detail: `${input.startDate} → ${input.endDate} · ${breakdown.hours}h PTO · ${breakdown.publicHolidayDays} PH excluded`,
          },
        );
        return leave;
      },
      decideLeave: (id, decision, note) =>
        save(
          (prev) => ({
            ...prev,
            leaves: (prev.leaves ?? []).map((leave) =>
              leave.id === id
                ? {
                    ...leave,
                    status: decision,
                    decidedById: prev.settings.activeUserId,
                    decidedAt: new Date().toISOString(),
                    decisionNote: note,
                    updatedAt: new Date().toISOString(),
                  }
                : leave,
            ),
          }),
          { action: `Leave ${decision}`, detail: id },
        ),
      cancelLeave: (id) =>
        save(
          (prev) => ({
            ...prev,
            leaves: (prev.leaves ?? []).map((leave) =>
              leave.id === id
                ? { ...leave, status: 'cancelled', updatedAt: new Date().toISOString() }
                : leave,
            ),
          }),
          { action: 'Leave cancelled', detail: id },
        ),
      deleteLeave: (id) =>
        save(
          (prev) => ({ ...prev, leaves: (prev.leaves ?? []).filter((leave) => leave.id !== id) }),
          { action: 'Leave record deleted', detail: id },
        ),
      upsertProject: (project) =>
        save(
          (prev) => ({
            ...prev,
            projects: prev.projects.some((row) => row.id === project.id)
              ? prev.projects.map((row) => (row.id === project.id ? project : row))
              : [project, ...prev.projects],
          }),
          { action: 'Project saved', detail: `${project.code} · ${project.name}` },
        ),
      submitCapitalisation: (entityId, departmentId, month) => {
        // Snapshot the live timesheet numbers into an immutable board request.
        const current = normaliseState(latestStateRef.current);
        const approval = buildApproval(current, entityId, departmentId, month, 'submitted');
        const report = capitalisationReport(current, { entityId, departmentId, ...monthScope(month) });
        approval.capitalisedHours = report.capitalisedHours;
        approval.capitalisedCostAUD = report.capitalisedCost;
        approval.excludedHours = report.excludedProjectHours + report.nonProjectHours;
        approval.utilisation = report.utilisation;
        approval.submittedById = current.settings.activeUserId;
        approval.submittedAt = new Date().toISOString();
        save(
          (prev) => ({
            ...prev,
            capitalisationApprovals: [
              approval,
              ...prev.capitalisationApprovals.filter((row) => row.id !== approval.id),
            ],
          }),
          {
            action: 'Capitalisation pack submitted',
            detail: `${month} · ${approval.capitalisedHours}h · ${approval.capitalisedCostAUD} ${current.capitalisation.currency}`,
          },
        );
        return approval;
      },
      decideCapitalisation: (id, status, note) =>
        save(
          (prev) => ({
            ...prev,
            capitalisationApprovals: prev.capitalisationApprovals.map((row) =>
              row.id === id
                ? {
                    ...row,
                    status,
                    note: note || row.note,
                    decidedById: prev.settings.activeUserId,
                    decidedAt: new Date().toISOString(),
                  }
                : row,
            ),
          }),
          { action: `Capitalisation pack ${status}`, detail: id },
        ),
      loadRetailSample: () => {
        const merged = withRetailSample(normaliseState(latestStateRef.current));
        save(merged, {
          action: 'Retail capital programme loaded',
          detail: 'Harbourline Retail Australia added without changing existing Meridian records',
        });
      },
      resetDemo: () => {
        if (shared) return; // never replace the shared database with demo data
        localStorage.removeItem(STORAGE_KEY);
        setFullState(createSeedState());
      },
    };
  }, [
    state,
    scopedState,
    tenants,
    tenant,
    calendarScope,
    calendarDepartmentIds,
    workspace,
    scope,
    save,
    queueSync,
    shared,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

export function useScope() {
  return useStore().scope;
}

/**
 * The active tenant cut down to the departments the calendar is implemented
 * for (single / multiple / all). Operational screens read this so a
 * single-department roll-out never shows another department's resources.
 */
export function useScopedState() {
  return useStore().scopedState;
}

export const newId = uid;

export function emptyActivity(state: StoreState, defaults: Partial<Activity> = {}): Activity {
  const me = state.employees.find((e) => e.id === state.settings.activeUserId) ?? state.employees[0];
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: uid('act'),
    title: '',
    description: '',
    type: 'task',
    entityId: me.entityId,
    departmentId: me.departmentId,
    assigneeId: me.id,
    createdById: me.id,
    startDate: today,
    endDate: today,
    startTime: '09:00',
    endTime: '10:00',
    plannedHours: 2,
    status: 'not_started',
    priority: 'medium',
    progress: 0,
    location: 'Teams',
    subtasks: [],
    sync: { outlook: true, google: false },
    createdAt: today,
    ...defaults,
  };
}

export function emptyEmployee(state: StoreState): Employee {
  const dept = state.departments[0];
  const tenant = state.tenants.find((row) => row.id === state.settings.activeTenantId);
  return {
    id: uid('emp'),
    name: '',
    email: '',
    code: `MGH-${Math.floor(1000 + Math.random() * 8999)}`,
    entityId: dept?.entityId ?? state.entities[0].id,
    departmentId: dept?.id ?? '',
    role: 'employee',
    managerId: null,
    countryCode: tenant?.countryCode ?? 'AE',
    weeklyHours: 38,
    joinDate: new Date().toISOString().slice(0, 10),
    status: 'active',
    avatarColor: '#3b82f6',
  };
}

export function emptyDepartment(state: StoreState): Department {
  return {
    id: uid('dept'),
    entityId: state.entities[1]?.id ?? state.entities[0].id,
    name: '',
    code: '',
    headId: null,
    opsOwnerId: state.employees.find((e) => e.role === 'head_operations')?.id ?? null,
    costCenter: '',
    color: '#3b82f6',
  };
}

export function emptyTimeEntry(state: StoreState): TimeEntry {
  return {
    id: uid('te'),
    employeeId: state.settings.activeUserId,
    activityId: state.activities[0]?.id ?? '',
    date: new Date().toISOString().slice(0, 10),
    hours: 2,
    note: '',
    billable: true,
    approved: false,
  };
}

export function emptyHoliday(state: StoreState): Holiday {
  return {
    id: uid('hol'),
    countryCode: state.employees.find((e) => e.id === state.settings.activeUserId)?.countryCode ?? 'AE',
    date: new Date().toISOString().slice(0, 10),
    name: '',
    type: 'public_holiday',
  };
}

export function emptyStandup(state: StoreState, date: string): StandupEntry {
  const me = state.employees.find((e) => e.id === state.settings.activeUserId) ?? state.employees[0];
  const now = new Date().toISOString();
  return {
    id: uid('std'),
    date,
    departmentId: me.departmentId,
    employeeId: me.id,
    lastDayUpdate: '',
    progressUpdate: '',
    blockers: '',
    actionItems: [],
    supportRequests: [],
    status: 'draft',
    submittedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function emptyEscalation(state: StoreState, departmentId: string): Escalation {
  const dept = state.departments.find((d) => d.id === departmentId) ?? state.departments[0];
  const head = state.employees.find((e) => e.id === dept.headId);
  const coo = state.employees.find((e) => e.role === 'head_operations');
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: uid('esc'),
    departmentId: dept.id,
    period: 'week',
    periodStart: today,
    periodEnd: today,
    score: 0,
    threshold: state.settings.performanceThreshold,
    utilization: 0,
    onTimeRate: 0,
    recipients: head ? [head.id] : [],
    cc: coo ? [coo.id] : [],
    createdAt: new Date().toISOString(),
    status: 'open',
    note: '',
  };
}
