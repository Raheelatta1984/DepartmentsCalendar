import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Activity,
  AuditEntry,
  CalendarConnection,
  CalendarProvider,
  CalendarScopeSettings,
  CalendarShare,
  Department,
  DeliveryStream,
  Designation,
  WorkItem,
  WorkItemImportPreview,
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
import {
  canApproveEmployeeTime,
  canAssignActivity,
  canEditActivity,
  canLogForEmployee,
  getScope,
  type Scope,
} from './lib/permissions';
import { addHoursToTime, timeWindowError } from './lib/time';
import { withDesignationDefaults } from './lib/master-data';
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
import { externalKey, linkActivity, linkWorkItemsToParent, normaliseAcceptanceCriteria, validateWorkItem, validStreamParent, workItemDescendants } from './lib/delivery';
import { devopsSampleWorkItems } from './data/delivery-seed';
import { DEFAULT_TENANT_ID, HARRIS_FARM_TENANT_ID, HARBOURLINE_TENANT_ID, MERIDIAN_TENANT_ID, TENANTS } from './data/tenant-seed';
import { HARRIS_FARM_ACTIVE_USER_ID, withHarrisFarmSample } from './data/harris-farm-seed';
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
    state.employees?.find((employee) => employee.role === 'ceo' && employee.responsibleDepartmentIds?.some((id) => tenantDeptIds.has(id))) ??
    state.employees?.find((employee) => employee.role === 'department_head' && employee.departmentId === tenant?.calendarScope.departmentIds[0]) ??
    state.employees?.find((employee) => tenantDeptIds.has(employee.departmentId)) ??
    state.employees?.[0];

  const stateWithMasters = {
    ...state,
    entities,
    designations: Array.isArray(state.designations) ? state.designations : [],
    calendarShares: Array.isArray(state.calendarShares) ? state.calendarShares : [],
  };
  // Derive reusable titles only for legacy snapshots that predate the master.
  // Once initialized, an explicitly custom employee title stays custom.
  const designatedState = Array.isArray(state.designations)
    ? stateWithMasters
    : withDesignationDefaults(stateWithMasters);

  return {
    ...designatedState,
    tenants,
    entities,
    deliveryStreams: Array.isArray(state.deliveryStreams) ? state.deliveryStreams : [],
    // Older caches and shared snapshots predate acceptance criteria; heal them
    // to an empty string so every work item has one predictable shape.
    workItems: (Array.isArray(state.workItems) ? state.workItems : []).map((item) => ({
      ...item,
      acceptanceCriteria: item.acceptanceCriteria ?? '',
    })),
    devopsImports: Array.isArray(state.devopsImports) ? state.devopsImports : [],
    departments: (state.departments ?? []).map((department) => ({
      ...department,
      devopsEnabled: department.devopsEnabled ?? ['RIT', 'ITS'].includes(department.code),
    })),
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

/** Apply one-time, additive seed migrations without re-adding user-deleted tenants later. */
export function initialiseWorkspaceState(state: StoreState): StoreState {
  if ((state.settings?.onboardingVersion ?? 0) >= 1) return normaliseState(state);

  let migrated = state;
  const hasHarrisFarm = (state.tenants ?? []).some((row) => row.id === HARRIS_FARM_TENANT_ID);
  if (!hasHarrisFarm) {
    migrated = withHarrisFarmSample(state);
  }
  const shouldOpenHarrisFarm =
    !state.settings?.activeTenantId || state.settings.activeTenantId === HARBOURLINE_TENANT_ID;
  migrated = {
    ...migrated,
    settings: {
      ...migrated.settings,
      onboardingVersion: 1,
      ...(shouldOpenHarrisFarm
        ? {
            activeTenantId: HARRIS_FARM_TENANT_ID,
            activeUserId: HARRIS_FARM_ACTIVE_USER_ID,
            groupName: 'Harris Farm Markets',
          }
        : {}),
    },
  };
  return normaliseState(migrated);
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
    return initialiseWorkspaceState(parsed);
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
  upsertActivity: (activity: Activity) => string | null;
  deleteActivity: (id: string) => void;
  updateActivityStatus: (id: string, status: Activity['status'], progress?: number) => void;
  toggleSubtask: (activityId: string, subtaskId: string) => void;
  upsertEmployee: (employee: Employee) => void;
  deleteEmployee: (id: string) => void;
  upsertDepartment: (department: Department) => void;
  deleteDepartment: (id: string) => void;
  upsertDesignation: (designation: Designation) => string | null;
  deleteDesignation: (id: string) => string | null;
  shareCalendar: (share: CalendarShare) => string | null;
  revokeCalendarShare: (id: string) => void;
  upsertEntity: (entity: Entity) => void;
  deleteEntity: (id: string) => void;
  addTimeEntry: (entry: TimeEntry) => string | null;
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
  upsertStream: (stream: DeliveryStream) => string | null;
  deleteStream: (id: string) => string | null;
  upsertWorkItem: (item: WorkItem) => string | null;
  linkWorkItems: (parentId: string, childIds: string[]) => string | null;
  loadDevopsSample: (departmentId?: string) => string | null;
  importWorkItems: (preview: WorkItemImportPreview, filename: string) => string | null;
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
    shared
      ? initialiseWorkspaceState(fromSharedState(shared.snapshot.state))
      : loadState(),
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

  /* Master setting in action: single / multiple / all departments. Direct
     person-to-person calendar grants are then added row by row. Including the
     owner's whole department here would leak colleagues and expand access
     beyond the read-only grant, so only the shared owner's operational rows
     cross the configured department boundary. */
  const scopedState = useMemo(() => {
    const base = scopeStateToDepartments(state, calendarDepartmentIds);
    const relevantShares = state.calendarShares.filter((share) =>
      share.ownerId !== activeUserId && (
        (share.audience === 'employee' && share.employeeId === activeUserId) ||
        (share.audience === 'department' && share.departmentId === ownDepartmentId)
      ),
    );
    const sharedOwnerIds = new Set(relevantShares.map((share) => share.ownerId));
    const sharedOwners = state.employees.filter((employee) =>
      sharedOwnerIds.has(employee.id) && !base.employees.some((row) => row.id === employee.id),
    );
    if (!sharedOwners.length) return base;
    const sharedDepartmentIds = new Set(sharedOwners.map((employee) => employee.departmentId));
    return {
      ...base,
      departments: [
        ...base.departments,
        ...state.departments.filter((department) => sharedDepartmentIds.has(department.id) && !base.departments.some((row) => row.id === department.id)),
      ],
      employees: [...base.employees, ...sharedOwners],
      activities: [
        ...base.activities,
        ...state.activities.filter((activity) => sharedOwnerIds.has(activity.assigneeId) && !base.activities.some((row) => row.id === activity.id)),
      ],
      timeEntries: [
        ...base.timeEntries,
        ...state.timeEntries.filter((entry) => sharedOwnerIds.has(entry.employeeId) && !base.timeEntries.some((row) => row.id === entry.id)),
      ],
      leaves: [
        ...(base.leaves ?? []),
        ...(state.leaves ?? []).filter((leave) => sharedOwnerIds.has(leave.employeeId) && !(base.leaves ?? []).some((row) => row.id === leave.id)),
      ],
      calendarShares: [
        ...base.calendarShares,
        ...relevantShares.filter((share) => !base.calendarShares.some((row) => row.id === share.id)),
      ],
    };
  }, [state, calendarDepartmentIds, activeUserId, ownDepartmentId]);

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
  const latestFullStateRef = useRef(fullState);
  latestFullStateRef.current = fullState;

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
              targetState.employees.find((employee) => employee.role === 'ceo' && employee.responsibleDepartmentIds !== undefined) ??
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
      upsertActivity: (inputActivity) => {
        const current = latestStateRef.current;
        const actorId = current.settings.activeUserId;
        const existing = current.activities.find((row) => row.id === inputActivity.id);
        if (existing && !canEditActivity(current, actorId, existing)) {
          return 'This shared calendar is read-only. Only the assignee or their reporting lead can change the activity.';
        }
        const assignmentSource = { ...inputActivity, assigneeId: existing?.assigneeId ?? actorId };
        if (!canAssignActivity(current, actorId, assignmentSource, inputActivity.assigneeId)) {
          return inputActivity.type === 'task'
            ? 'You can assign this task only to yourself, your reporting team, or a colleague when delegating your own task.'
            : 'Only the employee or their reporting lead can schedule this activity for another person.';
        }
        const assignee = current.employees.find((employee) => employee.id === inputActivity.assigneeId);
        if (!assignee || assignee.status === 'inactive') return 'Select an active employee in this tenant.';
        if (inputActivity.endDate < inputActivity.startDate) return 'The end date cannot be before the start date.';
        if (inputActivity.startDate === inputActivity.endDate) {
          const mismatch = timeWindowError(inputActivity.plannedHours, inputActivity.startTime, inputActivity.endTime);
          if (mismatch) return mismatch;
        }
        if (inputActivity.plannedHours <= 0) return 'Planned hours must be greater than zero for workload calculations.';

        const now = new Date().toISOString();
        const delegationHistory = [...(existing?.delegationHistory ?? inputActivity.delegationHistory ?? [])];
        const changedOwner = Boolean(existing && existing.assigneeId !== inputActivity.assigneeId);
        const newPeerDelegation = Boolean(
          !existing && inputActivity.assigneeId !== actorId && !canLogForEmployee(current, actorId, inputActivity.assigneeId),
        );
        if (changedOwner || newPeerDelegation) {
          delegationHistory.push({
            fromEmployeeId: existing?.assigneeId ?? actorId,
            toEmployeeId: inputActivity.assigneeId,
            byEmployeeId: actorId,
            at: now,
            note: inputActivity.delegationNote?.trim() ?? '',
          });
        }

        const rawActivity: Activity = {
          ...inputActivity,
          createdById: existing?.createdById ?? actorId,
          departmentId: assignee.departmentId,
          entityId: assignee.entityId,
          delegationHistory,
          delegationNote: changedOwner || newPeerDelegation ? inputActivity.delegationNote?.trim() ?? '' : existing?.delegationNote,
        };
        save(
          (prev) => {
            const activity = rawActivity.workItemId ? linkActivity(prev, rawActivity, rawActivity.workItemId) : rawActivity;
            const activities = existing
              ? prev.activities.map((row) => (row.id === activity.id ? activity : row))
              : [activity, ...prev.activities];
            const providers: CalendarProvider[] = [];
            if (activity.sync.outlook) providers.push('outlook');
            if (activity.sync.google) providers.push('google');
            const withSync = queueSync(prev, activity, existing ? 'update' : 'create', providers);
            return { ...withSync, activities };
          },
          {
            action: changedOwner || newPeerDelegation ? 'Task delegated' : 'Activity saved',
            detail: changedOwner || newPeerDelegation
              ? `${inputActivity.title} → ${assignee.name}`
              : `${inputActivity.title} · ${assignee.name}`,
          },
        );
        return null;
      },
      deleteActivity: (id) =>
        save(
          (prev) => {
            const activity = prev.activities.find((a) => a.id === id);
            if (!activity || !canEditActivity(prev, prev.settings.activeUserId, activity)) return prev;
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
            const existing = prev.activities.find((row) => row.id === id);
            if (!existing || !canEditActivity(prev, prev.settings.activeUserId, existing)) return prev;
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
            if (a.id !== activityId || !canEditActivity(prev, prev.settings.activeUserId, a)) return a;
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
            deliveryStreams: prev.deliveryStreams.map((s) => s.leadId === id ? { ...s, leadId: null } : s),
            calendarShares: prev.calendarShares.filter((share) => share.ownerId !== id && share.employeeId !== id),
            workItems: prev.workItems.map((i) => i.assigneeId === id ? { ...i, assigneeId: null } : i),
            departments: prev.departments.map((d) => ({ ...d, headId: d.headId === id ? null : d.headId, opsOwnerId: d.opsOwnerId === id ? null : d.opsOwnerId })),
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
            deliveryStreams: prev.deliveryStreams.filter((s) => s.departmentId !== id),
            workItems: prev.workItems.filter((i) => i.departmentId !== id),
            devopsImports: prev.devopsImports.filter((i) => i.departmentId !== id),
            activities: prev.activities.filter((a) => a.departmentId !== id),
            calendarShares: prev.calendarShares.filter((share) => share.departmentId !== id),
          }),
          { action: 'Department removed', detail: id },
        ),
      upsertDesignation: (designation) => {
        const current = latestStateRef.current;
        if (!scope.canManageMaster) return 'Only department leadership can modify designations.';
        if (designation.tenantId !== current.settings.activeTenantId) return 'The designation must belong to the active tenant.';
        if (!designation.title.trim()) return 'Designation title is required.';
        if (current.designations.some((row) => row.id !== designation.id && row.tenantId === designation.tenantId && row.title.trim().toLowerCase() === designation.title.trim().toLowerCase())) {
          return 'A designation with this title already exists.';
        }
        const next = { ...designation, title: designation.title.trim(), code: designation.code.trim().toUpperCase() };
        save((prev) => ({
          ...prev,
          designations: prev.designations.some((row) => row.id === next.id)
            ? prev.designations.map((row) => row.id === next.id ? next : row)
            : [...prev.designations, next],
          employees: prev.employees.map((employee) => employee.designationId === next.id ? { ...employee, jobTitle: next.title } : employee),
        }), { action: 'Designation saved', detail: next.title });
        return null;
      },
      deleteDesignation: (id) => {
        const current = latestStateRef.current;
        if (!scope.canManageMaster) return 'Only department leadership can delete designations.';
        const designation = current.designations.find((row) => row.id === id);
        if (!designation) return null;
        const assigned = current.employees.filter((employee) => employee.designationId === id).length;
        if (assigned) return `Reassign ${assigned} employee${assigned === 1 ? '' : 's'} before deleting ${designation.title}.`;
        save((prev) => ({ ...prev, designations: prev.designations.filter((row) => row.id !== id) }), {
          action: 'Designation deleted', detail: designation.title,
        });
        return null;
      },
      shareCalendar: (share) => {
        const current = latestStateRef.current;
        const owner = current.employees.find((employee) => employee.id === current.settings.activeUserId);
        if (!owner || share.ownerId !== owner.id) return 'Employees can share only their own calendar.';
        if (share.audience === 'department') {
          if (share.departmentId !== owner.departmentId || share.employeeId) return 'A department share must target your own home department.';
        } else {
          const recipient = current.employees.find((employee) => employee.id === share.employeeId);
          if (!recipient || recipient.id === owner.id || recipient.status === 'inactive' || share.departmentId) {
            return 'Select another active employee in this tenant.';
          }
        }
        const duplicate = current.calendarShares.some((row) =>
          row.ownerId === owner.id && row.audience === share.audience &&
          row.departmentId === share.departmentId && row.employeeId === share.employeeId,
        );
        if (duplicate) return 'This calendar has already been shared with that audience.';
        save((prev) => ({ ...prev, calendarShares: [share, ...prev.calendarShares] }), {
          action: 'Calendar shared',
          detail: share.audience === 'department'
            ? `${owner.name} → ${current.departments.find((department) => department.id === share.departmentId)?.name ?? 'department'}`
            : `${owner.name} → ${current.employees.find((employee) => employee.id === share.employeeId)?.name ?? 'employee'}`,
        });
        return null;
      },
      revokeCalendarShare: (id) => {
        save((prev) => {
          const share = prev.calendarShares.find((row) => row.id === id);
          if (!share || share.ownerId !== prev.settings.activeUserId) return prev;
          return { ...prev, calendarShares: prev.calendarShares.filter((row) => row.id !== id) };
        }, { action: 'Calendar sharing revoked', detail: id });
      },
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
      addTimeEntry: (entry) => {
        const current = latestStateRef.current;
        const actorId = current.settings.activeUserId;
        const existing = current.timeEntries.find((row) => row.id === entry.id);
        if (!canLogForEmployee(current, actorId, entry.employeeId) || (existing && !canLogForEmployee(current, actorId, existing.employeeId))) {
          return 'You can log time only for yourself or a member of your reporting team.';
        }
        if (!entry.date) return 'Select a date.';
        if (!Number.isFinite(entry.hours) || entry.hours <= 0 || entry.hours > 24) return 'Hours must be greater than zero and no more than 24.';
        const mismatch = timeWindowError(entry.hours, entry.startTime, entry.endTime, { requireWindow: true });
        if (mismatch) return mismatch;
        const activity = current.activities.find((row) => row.id === entry.activityId);
        if (!activity) return 'Pick the activity this time belongs to.';
        const retainsOriginalActivity = Boolean(
          existing && existing.employeeId === entry.employeeId && existing.activityId === entry.activityId,
        );
        if (activity.assigneeId !== entry.employeeId && !retainsOriginalActivity) {
          return 'This activity is assigned to another employee. Delegate the task first, then log time under the current assignee.';
        }
        const now = new Date().toISOString();
        const next: TimeEntry = {
          ...entry,
          hours: Number(entry.hours),
          loggedById: actorId,
          approved: existing ? entry.approved : false,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        save(
          (prev) => ({
            ...prev,
            timeEntries: existing
              ? prev.timeEntries.map((row) => row.id === next.id ? next : row)
              : [next, ...prev.timeEntries],
          }),
          {
            action: existing ? 'Time entry updated' : 'Time logged',
            detail: `${entry.hours}h on ${entry.date}${actorId !== entry.employeeId ? ` · logged by ${actorId} on behalf of ${entry.employeeId}` : ''}`,
          },
        );
        return null;
      },
      deleteTimeEntry: (id) =>
        save((prev) => {
          const entry = prev.timeEntries.find((row) => row.id === id);
          if (!entry || !canLogForEmployee(prev, prev.settings.activeUserId, entry.employeeId)) return prev;
          return { ...prev, timeEntries: prev.timeEntries.filter((t) => t.id !== id) };
        }, {
          action: 'Time entry deleted',
          detail: id,
        }),
      toggleEntryApproved: (id) =>
        save((prev) => {
          const entry = prev.timeEntries.find((row) => row.id === id);
          if (!entry || !canApproveEmployeeTime(prev, prev.settings.activeUserId, entry.employeeId)) return prev;
          return {
            ...prev,
            timeEntries: prev.timeEntries.map((t) => (t.id === id ? { ...t, approved: !t.approved, updatedAt: new Date().toISOString() } : t)),
          };
        }),
      addHoliday: (holiday) =>
        save((prev) => ({
          ...prev,
          holidays: prev.holidays.some((row) => row.id === holiday.id)
            ? prev.holidays.map((row) => row.id === holiday.id ? holiday : row)
            : [...prev.holidays, holiday],
        }), {
          action: 'Holiday saved',
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
      connectCalendar: (connection) => {
        if (!canLogForEmployee(latestStateRef.current, activeUserId, connection.employeeId)) return;
        save(
          (prev) => {
            const others = prev.connections.filter(
              (c) => !(c.employeeId === connection.employeeId && c.provider === connection.provider),
            );
            return { ...prev, connections: [...others, connection] };
          },
          { action: 'Calendar connected', detail: `${connection.provider} · ${connection.accountEmail}` },
        );
      },
      disconnectCalendar: (employeeId, provider) => {
        if (!canLogForEmployee(latestStateRef.current, activeUserId, employeeId)) return;
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
        );
      },
      pushToCalendars: (activityId, providers) =>
        save((prev) => {
          const activity = prev.activities.find((a) => a.id === activityId);
          if (!activity || !canEditActivity(prev, prev.settings.activeUserId, activity)) return prev;
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
            a.id === activityId && canEditActivity(prev, prev.settings.activeUserId, a)
              ? { ...a, sync: { ...a.sync, [provider]: enabled } }
              : a,
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
      upsertStream: (stream) => {
        const current = latestStateRef.current;
        if (!scope.canManageMaster) return 'Only department leadership can configure streams in this pilot.';
        if (!stream.name.trim() || !stream.code.trim()) return 'Sub-department name and code are required.';
        if (!current.departments.some((department) => department.id === stream.departmentId)) return 'Select a department in this tenant.';
        if (!validStreamParent(current.deliveryStreams, stream.id, stream.parentId, stream.departmentId)) return 'A parent stream must be in the same department and cannot create a cycle.';
        if (current.deliveryStreams.some((s) => s.id !== stream.id && s.departmentId === stream.departmentId && s.code.toLowerCase() === stream.code.toLowerCase())) return 'Stream code must be unique in its department.';
        const previous = current.deliveryStreams.find((row) => row.id === stream.id);
        if (previous && previous.departmentId !== stream.departmentId) {
          const linked = current.employees.some((employee) => employee.departmentId === previous.departmentId && employee.streamId === stream.id)
            || current.workItems.some((item) => item.departmentId === previous.departmentId && item.streamId === stream.id)
            || current.activities.some((activity) => activity.departmentId === previous.departmentId && activity.streamId === stream.id);
          if (linked) return 'Reassign this sub-department’s people and linked work before moving it to another department.';
        }
        if (current.deliveryStreams.some((s) => s.parentId === stream.id && s.departmentId !== stream.departmentId)) return 'Move child streams to this department first.';
        const lead = current.employees.find((e) => e.id === stream.leadId);
        if (stream.leadId && lead?.departmentId !== stream.departmentId) return 'The stream lead must belong to the owning department.';
        save((prev) => ({ ...prev, deliveryStreams: prev.deliveryStreams.some((s) => s.id === stream.id) ? prev.deliveryStreams.map((s) => s.id === stream.id ? stream : s) : [...prev.deliveryStreams, stream] }), { action: 'Delivery stream saved', detail: `${stream.code} · ${stream.name}` });
        return null;
      },
      deleteStream: (id) => {
        const current = latestStateRef.current;
        if (!scope.canManageMaster) return 'Only department leadership can delete streams.';
        if (current.deliveryStreams.some((s) => s.parentId === id) || current.workItems.some((i) => i.streamId === id) || current.employees.some((e) => e.streamId === id) || current.activities.some((a) => a.streamId === id)) return 'This stream has children, people or linked work. Reassign them before deleting it.';
        save((prev) => ({ ...prev, deliveryStreams: prev.deliveryStreams.filter((s) => s.id !== id) }), { action: 'Delivery stream deleted', detail: id });
        return null;
      },
      upsertWorkItem: (item) => {
        const current = latestStateRef.current;
        const leading = current.deliveryStreams.some((s) => s.leadId === current.settings.activeUserId && s.departmentId === item.departmentId);
        if (!scope.canManageMaster && !leading) return 'Only department leadership or a stream lead can maintain the backlog.';
        if (!current.departments.find((d) => d.id === item.departmentId)?.devopsEnabled) return 'This department is not enabled for DevOps delivery.';
        if (item.streamId && !current.deliveryStreams.some((s) => s.id === item.streamId && s.departmentId === item.departmentId)) return 'Select a stream in the owning department.';
        if (item.projectId && !current.projects.some((p) => p.id === item.projectId && p.departmentId === item.departmentId)) return 'Select a project owned by the same department.';
        if (item.assigneeId && !current.employees.some((e) => e.id === item.assigneeId)) return 'Select a resource in this tenant.';
        if (current.workItems.some((i) => i.parentId === item.id && i.kind !== item.kind)) {
          if ((item.kind === 'epic' && current.workItems.some((i) => i.parentId === item.id && i.kind !== 'feature')) || (item.kind === 'feature' && current.workItems.some((i) => i.parentId === item.id && i.kind !== 'ticket')) || item.kind === 'ticket') return 'This item has dependent children; its type cannot be changed.';
        }
        const next = { ...item, title: item.title.trim(), acceptanceCriteria: normaliseAcceptanceCriteria(item.acceptanceCriteria), updatedAt: new Date().toISOString() };
        if (next.externalUrl && !/^https:\/\/(dev\.azure\.com\/|[a-z0-9-]+\.visualstudio\.com\/)/i.test(next.externalUrl)) return 'Use an Azure DevOps HTTPS work-item URL, or leave the URL blank.';
        if (next.externalId && current.workItems.some((i) => i.id !== next.id && externalKey(i) === externalKey(next))) return 'That Azure DevOps ID already exists. Edit or re-import the existing item.';
        const descendants = workItemDescendants(current.workItems, next.id);
        const nextItems = current.workItems.map((i) => descendants.has(i.id) ? { ...i, projectId: next.projectId, funding: next.funding, updatedAt: next.updatedAt } : i);
        const error = validateWorkItem(nextItems, next);
        if (error) return error;
        const changedIds = new Set(nextItems.filter((i) => descendants.has(i.id)).map((i) => i.id));
        save((prev) => ({ ...prev,
          workItems: prev.workItems.some((i) => i.id === item.id) ? prev.workItems.map((i) => nextItems.find((n) => n.id === i.id) ?? i) : [next, ...prev.workItems],
          activities: prev.activities.map((a) => a.workItemId && changedIds.has(a.workItemId) ? linkActivity({ ...prev, workItems: nextItems }, a, a.workItemId) : a),
        }), { action: 'Delivery work item saved', detail: `${item.kind} · ${item.externalId || item.id} · ${item.title}` });
        return null;
      },
      linkWorkItems: (parentId, childIds) => {
        const current = latestStateRef.current;
        const parent = current.workItems.find((i) => i.id === parentId);
        if (!parent) return 'Select the epic or feature to link work items to.';
        if (!current.departments.find((d) => d.id === parent.departmentId)?.devopsEnabled) return 'This department is not enabled for DevOps delivery.';
        const leading = current.deliveryStreams.some((s) => s.leadId === current.settings.activeUserId && s.departmentId === parent.departmentId);
        if (!scope.canManageMaster && !leading) return 'Only department leadership or a stream lead can link the backlog.';
        const result = linkWorkItemsToParent(current.workItems, parentId, childIds);
        if (result.error) return result.error;
        const linked = result.items.filter((i) => childIds.includes(i.id) && i.parentId === parentId);
        if (!linked.length) return 'Select at least one work item to link.';
        save((prev) => ({ ...prev, workItems: result.items }), {
          action: 'Backlog work items linked',
          detail: `${linked.length} item${linked.length === 1 ? '' : 's'} linked to ${parent.kind} · ${parent.title}`,
        });
        return null;
      },
      loadDevopsSample: (departmentId) => {
        const current = latestStateRef.current;
        const department = departmentId
          ? current.departments.find((d) => d.id === departmentId)
          : current.departments.find((d) => d.code === 'RIT') ?? current.departments.find((d) => d.devopsEnabled);
        if (!department?.devopsEnabled) return 'Enable DevOps delivery on a department first.';
        const leading = current.deliveryStreams.some((s) => s.leadId === current.settings.activeUserId && s.departmentId === department.id);
        if (!scope.canManageMaster && !leading) return 'Only department leadership or a stream lead can load the sample backlog.';
        const generated = devopsSampleWorkItems(current, department.id);
        if (!generated.length) return 'The sample backlog could not be created for this department.';
        const missing = generated.filter((item) => !current.workItems.some((old) => old.id === item.id));
        if (!missing.length) return 'The sample DevOps epic is already loaded.';
        const merged = [...missing, ...current.workItems];
        for (const item of missing) {
          const error = validateWorkItem(merged, item);
          if (error) return `${item.title}: ${error}`;
        }
        save((prev) => ({ ...prev, workItems: [...missing, ...prev.workItems] }), {
          action: 'DevOps sample backlog loaded',
          detail: `${missing.length} illustrative items · ${department.name} · no calendar bookings or actual hours were created`,
        });
        return null;
      },
      importWorkItems: (preview, filename) => {
        if (!scope.canManageMaster) return 'Only department leadership can import backlog data in this pilot.';
        if (preview.errors.length || !preview.items.length) return 'Resolve the preview errors before importing.';
        if (new TextEncoder().encode(JSON.stringify(latestFullStateRef.current)).length + new TextEncoder().encode(JSON.stringify(preview.items)).length > 3 * 1024 * 1024) return 'This batch would exceed the 3 MB shared-workspace limit. Import a smaller batch or move to record-level storage.';
        const current = latestStateRef.current;
        const merged = new Map(current.workItems.map((i) => [i.id, i]));
        preview.items.forEach((i) => merged.set(i.id, i));
        for (const item of preview.items) {
          if (!current.departments.find((d) => d.id === item.departmentId)?.devopsEnabled) return 'The import contains a department that is not enabled.';
          const error = validateWorkItem(Array.from(merged.values()), item);
          if (error) return `${item.externalId}: ${error}. Refresh the preview and try again.`;
        }
        const batch = { id: uid('imp'), departmentId: preview.items[0].departmentId, actorId: current.settings.activeUserId, at: new Date().toISOString(), filename, created: preview.created, updated: preview.updated, unchanged: preview.unchanged };
        save((prev) => ({ ...prev,
          workItems: [...preview.items.filter((i) => !prev.workItems.some((old) => old.id === i.id)), ...prev.workItems.map((old) => preview.items.find((i) => i.id === old.id) ?? old)],
          devopsImports: [batch, ...prev.devopsImports].slice(0, 100),
        }), { action: 'DevOps backlog imported', detail: `${filename} · ${preview.created} created · ${preview.updated} updated · ${preview.unchanged} unchanged` });
        return null;
      },
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
    plannedHours: 1,
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
    startTime: state.settings.workingDayStart,
    endTime: addHoursToTime(state.settings.workingDayStart, 2),
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
