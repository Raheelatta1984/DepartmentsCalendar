import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Command, CornerDownLeft, Search, User, X } from 'lucide-react';
import { useStore } from './store';
import type { AppFilters, ViewKey } from './types';
import { toISO, fromISO } from './lib/dates';
import { Sidebar, Topbar, NAV_ITEMS } from './components/Layout';
import { AiGuide } from './components/AiGuide';
import { ActivityModal } from './components/ActivityModal';
import { EmployeeModal } from './components/EmployeeModal';
import { Avatar, Badge, IconButton, Modal } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { CalendarPage } from './pages/CalendarPage';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { RoadmapPage } from './pages/RoadmapPage';
import { TimesheetPage } from './pages/TimesheetPage';
import { StandupsPage } from './pages/StandupsPage';
import { LeavePage } from './pages/LeavePage';
import { PerformancePage } from './pages/PerformancePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { DeliveryPage } from './pages/DeliveryPage';
import { EffortReportsPage } from './pages/EffortReportsPage';
import { CapitalisationPage } from './pages/CapitalisationPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { AdminPage } from './pages/AdminPage';
import { TypeIcon } from './components/activity-ui';
import { WorkspaceStatus } from './components/WorkspaceStatus';
import { WhatsNewPage } from './pages/WhatsNewPage';
import { ThemeStudioPage } from './pages/ThemeStudioPage';
import { fontStack, getEntityTheme } from './lib/portal-theme';

const VIEWS: ViewKey[] = ['dashboard', 'calendar', 'activities', 'roadmap', 'timesheet', 'standups', 'leave', 'delivery', 'effort-reports', 'projects', 'capitalisation', 'performance', 'integrations', 'admin', 'whats-new', 'theme-studio'];

function viewFromHash(): ViewKey {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return (VIEWS as string[]).includes(hash) ? (hash as ViewKey) : 'dashboard';
}

export function App() {
  const { state, scope, tenant, workspace } = useStore();
  const [view, setView] = useState<ViewKey>(viewFromHash);

  /* The dashboard opens on the person's own legal entity — the one their
     own department sits in, so the first screen is never empty. */
  const homeEntityId = useMemo(() => {
    const ownDepartment = state.departments.find((department) => department.id === scope.user.departmentId);
    return ownDepartment?.entityId ?? scope.user.entityId ?? 'all';
  }, [state.departments, scope.user.departmentId, scope.user.entityId]);

  const [filters, setFiltersState] = useState<AppFilters>({
    entityId: homeEntityId,
    departmentId: 'all',
    employeeId: 'all',
    period: 'week',
    anchor: toISO(new Date()),
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [activityDefaults, setActivityDefaults] = useState<Record<string, unknown>>({});
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const navigate = useCallback((next: ViewKey) => {
    setView(next);
    window.location.hash = `#/${next}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const setFilters = useCallback((patch: Partial<AppFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }, []);

  /* Persona switching re-anchors the dashboard on that person's entity:
     another company's figures must never leak into their command centre. */
  useEffect(() => {
    setFiltersState((prev) =>
      prev.entityId === homeEntityId && prev.departmentId === 'all'
        ? prev
        : { ...prev, entityId: homeEntityId, departmentId: 'all' },
    );
  }, [scope.user.id, homeEntityId]);

  const openActivity = useCallback((id: string) => {
    setEditingActivityId(id);
    setActivityDefaults({});
    setActivityOpen(true);
  }, []);

  const newActivity = useCallback(
    (defaults: Record<string, unknown> = {}) => {
      setEditingActivityId(null);
      setActivityDefaults(defaults);
      setActivityOpen(true);
    },
    [],
  );

  const editingActivity = editingActivityId ? state.activities.find((a) => a.id === editingActivityId) ?? null : null;
  const activeNav = NAV_ITEMS.find((n) => n.id === view);
  const activeEntity = state.entities.find((entity) => entity.id === scope.user.entityId);
  const activeTheme = getEntityTheme(activeEntity);
  const portalStyle = {
    backgroundColor: activeTheme.backgroundColor,
    fontFamily: fontStack(activeTheme.fontFamily),
    '--portal-accent': activeTheme.brandColor,
    '--portal-accent-soft': `color-mix(in srgb, ${activeTheme.brandColor} 12%, white)`,
    '--portal-heading-font': fontStack(activeTheme.headingFont),
  } as React.CSSProperties;

  const paletteResults = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    const employees = state.employees
      .filter((e) => scope.visibleEmployeeIds.includes(e.id))
      .filter((e) => (q ? `${e.name} ${e.email} ${e.code}`.toLowerCase().includes(q) : true))
      .slice(0, q ? 6 : 4);
    const activities = state.activities
      .filter((a) => scope.visibleDepartmentIds.includes(a.departmentId))
      .filter((a) => (q ? `${a.title} ${a.description}`.toLowerCase().includes(q) : true))
      .slice(0, q ? 8 : 4);
    return { employees, activities };
  }, [paletteQuery, state.employees, state.activities, scope.visibleEmployeeIds, scope.visibleDepartmentIds]);

  return (
    <div className="portal-theme min-h-screen bg-slate-100/70" style={portalStyle} inert={workspace.status === 'refreshing'}>
      <Sidebar view={view} onNavigate={navigate} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="lg:pl-[248px]">
        <Topbar
          view={view}
          onNavigate={navigate}
          onNewActivity={() => newActivity()}
          onToggleMobile={() => setMobileOpen(true)}
          onGlobalSearch={() => setPaletteOpen(true)}
        />
        <main className="mx-auto max-w-[1560px] px-3 py-4 sm:px-5 sm:py-5">
          <WorkspaceStatus />
          {/* The guide is pinned to the top of the tab it explains, above the
              section it is describing — never a bubble in the bottom corner. */}
          <AiGuide view={view} filters={filters} />
          <div key={view} className="animate-fade-up">
            {view === 'dashboard' ? (
              <Dashboard
                filters={filters}
                setFilters={setFilters}
                onNavigate={navigate}
                onOpenActivity={openActivity}
                onNewActivity={() => newActivity()}
                onOpenEmployee={setEmployeeId}
              />
            ) : null}
            {view === 'calendar' ? (
              <CalendarPage
                filters={filters}
                setFilters={setFilters}
                onOpenActivity={openActivity}
                onNewActivity={(defaults) => newActivity(defaults)}
                onOpenEmployee={setEmployeeId}
              />
            ) : null}
            {view === 'activities' ? (
              <ActivitiesPage filters={filters} setFilters={setFilters} onOpenActivity={openActivity} onNewActivity={() => newActivity()} />
            ) : null}
            {view === 'roadmap' ? <RoadmapPage filters={filters} setFilters={setFilters} onOpenActivity={openActivity} /> : null}
            {view === 'timesheet' ? <TimesheetPage filters={filters} setFilters={setFilters} onNewActivity={() => newActivity()} /> : null}
            {view === 'standups' ? <StandupsPage /> : null}
            {view === 'leave' ? <LeavePage filters={filters} /> : null}
            {view === 'delivery' ? <DeliveryPage onNewActivity={(defaults) => newActivity(defaults)} onNavigate={navigate} /> : null}
            {view === 'effort-reports' ? <EffortReportsPage /> : null}
            {view === 'projects' ? <ProjectsPage /> : null}
            {view === 'capitalisation' ? <CapitalisationPage /> : null}
            {view === 'performance' ? <PerformancePage filters={filters} setFilters={setFilters} onOpenEmployee={setEmployeeId} /> : null}
            {view === 'integrations' ? <IntegrationsPage /> : null}
            {view === 'admin' ? <AdminPage /> : null}
            {view === 'whats-new' ? <WhatsNewPage onOpenThemeStudio={() => navigate('theme-studio')} /> : null}
            {view === 'theme-studio' ? <ThemeStudioPage /> : null}
          </div>
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 py-3 text-[10px] text-slate-400">
            <span>
              {activeTheme.portalFooter || `Orbit · activity, workload, PTO & roadmap portal for ${tenant?.name ?? state.settings.groupName}`} ·{' '}
              {state.entities.length} entities · {state.departments.length} departments · {state.employees.length} people · tenant-scoped
            </span>
            <span className="flex items-center gap-1">
              <Command className="h-3 w-3" /> K to search · {workspace.mode === 'shared' ? 'shared data stored in Neon' : 'demo data stored locally in your browser'}
            </span>
          </footer>
        </main>
      </div>

      <ActivityModal
        open={activityOpen}
        onClose={() => {
          setActivityOpen(false);
          setEditingActivityId(null);
        }}
        activity={editingActivity}
        defaults={activityDefaults}
      />

      <EmployeeModal
        employeeId={employeeId}
        onClose={() => setEmployeeId(null)}
        onOpenActivity={(id) => {
          setEmployeeId(null);
          openActivity(id);
        }}
        onNewActivity={() => {
          const emp = state.employees.find((e) => e.id === employeeId);
          setEmployeeId(null);
          newActivity(emp ? { assigneeId: emp.id, departmentId: emp.departmentId, entityId: emp.entityId } : {});
        }}
      />

      <Modal
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        title="Search the workspace"
        subtitle="People, activities and destinations — ⌘K / Ctrl+K from anywhere"
        width="max-w-xl"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={paletteQuery}
            onChange={(e) => setPaletteQuery(e.target.value)}
            placeholder="Search a person, a task, a seminar…"
            className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {paletteQuery ? (
            <button onClick={() => setPaletteQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-3 space-y-4">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">People</div>
            <div className="space-y-0.5">
              {paletteResults.employees.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    setEmployeeId(e.id);
                    setPaletteOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                >
                  <Avatar name={e.name} color={e.avatarColor} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-slate-800">{e.name}</span>
                    <span className="block truncate text-[10px] text-slate-500">
                      {e.role.replace('_', ' ')} · {state.departments.find((d) => d.id === e.departmentId)?.name}
                    </span>
                  </span>
                  <CornerDownLeft className="h-3 w-3 text-slate-300" />
                </button>
              ))}
              {paletteResults.employees.length === 0 ? <p className="px-2 text-[11px] text-slate-400">No people match.</p> : null}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Activities</div>
            <div className="space-y-0.5">
              {paletteResults.activities.map((a) => {
                const dept = state.departments.find((d) => d.id === a.departmentId);
                return (
                  <button
                    key={a.id}
                    onClick={() => {
                      setPaletteOpen(false);
                      openActivity(a.id);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                  >
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded" style={{ background: `${dept?.color}18`, color: dept?.color }}>
                      <TypeIcon type={a.type} className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-slate-800">{a.title}</span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {dept?.name} · {a.startDate}
                        {a.startTime ? ` · ${a.startTime}` : ''} · {a.plannedHours}h
                      </span>
                    </span>
                    <Badge tone={a.status === 'completed' ? 'good' : a.status === 'blocked' ? 'danger' : 'neutral'}>{a.status.replace('_', ' ')}</Badge>
                  </button>
                );
              })}
              {paletteResults.activities.length === 0 ? <p className="px-2 text-[11px] text-slate-400">No activities match.</p> : null}
            </div>
          </div>

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Go to</div>
            <div className="grid grid-cols-2 gap-1">
              {NAV_ITEMS.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    navigate(n.id);
                    setPaletteOpen(false);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-left text-[11px] text-slate-600 hover:border-brand-200 hover:bg-brand-50"
                >
                  {n.icon}
                  {n.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
