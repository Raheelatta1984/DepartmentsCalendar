import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Activity,
  AuditEntry,
  CalendarConnection,
  CalendarProvider,
  Department,
  Employee,
  Entity,
  Escalation,
  Holiday,
  Settings,
  StoreState,
  SyncJob,
  TimeEntry,
} from './types';
import { createSeedState } from './data/seed';
import { buildHolidayDataset } from './data/countries';
import { getScope, type Scope } from './lib/permissions';
import { fromSharedState, rememberPersona } from './lib/workspace-api';
import { useWorkspacePersistence, type SharedConnection, type WorkspacePersistence } from './lib/useWorkspacePersistence';

const STORAGE_KEY = 'orbit.portal.state.v1';

function loadState(): StoreState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedState();
    const parsed = JSON.parse(raw) as StoreState;
    if (!parsed.employees?.length || !parsed.activities || !parsed.settings) return createSeedState();
    // heals older caches when the demo schema evolves
    if (!parsed.syncJobs || !parsed.connections || !parsed.escalations) return createSeedState();
    return parsed;
  } catch {
    return createSeedState();
  }
}

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

interface StoreContextValue {
  state: StoreState;
  workspace: WorkspacePersistence;
  scope: Scope;
  save: (next: StoreState | ((prev: StoreState) => StoreState), audit?: Omit<AuditEntry, 'id' | 'at' | 'actorId'>) => void;
  setActiveUser: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
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
  connectCalendar: (connection: CalendarConnection) => void;
  disconnectCalendar: (employeeId: string, provider: CalendarProvider) => void;
  pushToCalendars: (activityId: string, providers?: CalendarProvider[]) => void;
  setActivitySync: (activityId: string, provider: CalendarProvider, enabled: boolean) => void;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children, shared }: { children: React.ReactNode; shared?: SharedConnection }) {
  const [state, setState] = useState<StoreState>(() => shared ? fromSharedState(shared.snapshot.state) : loadState());
  const workspace = useWorkspacePersistence(state, setState, shared);
  const writeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (shared) {
      // Shared company data is never cached in localStorage. Only this device's
      // persona preference is local; it cannot change anyone else's view.
      rememberPersona(state.settings.activeUserId);
      return;
    }
    if (writeTimer.current) window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* storage full — the session still works in memory */
      }
    }, 250);
    return () => {
      if (writeTimer.current) window.clearTimeout(writeTimer.current);
    };
  }, [state, shared]);

  const scope = useMemo(() => getScope(state, state.settings.activeUserId), [state]);

  const save = useCallback<StoreContextValue['save']>((next, audit) => {
    setState((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      if (!audit) return resolved;
      const entry: AuditEntry = {
        id: uid('aud'),
        at: new Date().toISOString(),
        actorId: resolved.settings.activeUserId,
        action: audit.action,
        detail: audit.detail,
      };
      return { ...resolved, auditLog: [entry, ...resolved.auditLog].slice(0, 250) };
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
      workspace,
      scope,
      save,
      setActiveUser: (id) => save((prev) => ({ ...prev, settings: { ...prev.settings, activeUserId: id } })),
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
      resetDemo: () => {
        if (shared) return; // never replace the shared database with demo data
        localStorage.removeItem(STORAGE_KEY);
        setState(createSeedState());
      },
    };
  }, [state, scope, save, queueSync, workspace, shared]);

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
  return {
    id: uid('emp'),
    name: '',
    email: '',
    code: `MGH-${Math.floor(1000 + Math.random() * 8999)}`,
    entityId: dept?.entityId ?? state.entities[0].id,
    departmentId: dept?.id ?? '',
    role: 'employee',
    managerId: null,
    countryCode: 'AE',
    weeklyHours: 45,
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
