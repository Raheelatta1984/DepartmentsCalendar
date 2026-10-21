import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarDays,
  ChevronsUpDown,
  Clock3,
  GanttChartSquare,
  LayoutDashboard,
  Landmark,
  ListChecks,
  Menu,
  Plug,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Users,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { ROLE_LABELS, ROLE_RANK, describeScope } from '../lib/permissions';
import type { ViewKey } from '../types';
import { Avatar, Badge, Button, IconButton } from './ui';

export const NAV_ITEMS: { id: ViewKey; label: string; icon: React.ReactNode; group: string; hint: string }[] = [
  { id: 'dashboard', label: 'Command centre', icon: <LayoutDashboard className="h-4 w-4" />, group: 'Workspace', hint: 'Live workload & performance' },
  { id: 'calendar', label: 'Department calendar', icon: <CalendarDays className="h-4 w-4" />, group: 'Workspace', hint: 'Collective & individual calendars' },
  { id: 'activities', label: 'Activity register', icon: <ListChecks className="h-4 w-4" />, group: 'Workspace', hint: 'Tasks, meetings, seminars' },
  { id: 'roadmap', label: 'Roadmap timeline', icon: <GanttChartSquare className="h-4 w-4" />, group: 'Workspace', hint: 'Year → month → week → day grid' },
  { id: 'timesheet', label: 'Timesheets', icon: <Clock3 className="h-4 w-4" />, group: 'Workspace', hint: 'Log and approve effort' },
  { id: 'projects', label: 'IT projects & capex', icon: <Wallet className="h-4 w-4" />, group: 'Workspace', hint: 'Capital and operational portfolio' },
  { id: 'capitalisation', label: 'Capitalisation pack', icon: <Landmark className="h-4 w-4" />, group: 'Governance', hint: 'Board approval of IT effort' },
  { id: 'performance', label: 'Performance & escalation', icon: <TrendingUp className="h-4 w-4" />, group: 'Governance', hint: 'Scores, alerts, escalation log' },
  { id: 'integrations', label: 'Calendar sync', icon: <Plug className="h-4 w-4" />, group: 'Governance', hint: 'Outlook & Google connectors' },
  { id: 'admin', label: 'Master setup', icon: <Settings2 className="h-4 w-4" />, group: 'Configuration', hint: 'Entities, departments, people, holidays' },
];

export function Sidebar({
  view,
  onNavigate,
  mobileOpen,
  onCloseMobile,
}: {
  view: ViewKey;
  onNavigate: (v: ViewKey) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { state, scope } = useStore();
  const groups = ['Workspace', 'Governance', 'Configuration'];
  const openEscalations = state.escalations.filter((e) => e.status === 'open').length;

  return (
    <>
      {mobileOpen ? (
        <div className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" onClick={onCloseMobile} aria-hidden />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-ink-900 text-slate-300 transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 shadow-lg shadow-brand-900/40">
            <GanttChartSquare className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">Orbit</div>
            <div className="truncate text-[10px] uppercase tracking-[0.16em] text-slate-500">Activity & delivery</div>
          </div>
          <button className="lg:hidden" onClick={onCloseMobile} aria-label="Close menu">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="mx-3 mb-4 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            <Building2 className="h-3 w-3" /> Group
          </div>
          <div className="mt-1 truncate text-xs font-semibold text-slate-100">{state.settings.groupName}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Badge tone="brand" className="!bg-brand-500/15 !text-brand-200 !ring-brand-400/20">
              {state.entities.filter((e) => e.type !== 'group').length} entities
            </Badge>
            <Badge tone="neutral" className="!bg-white/5 !text-slate-300 !ring-white/10">
              {state.departments.length} depts
            </Badge>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {groups.map((group) => (
            <div key={group} className="mb-4">
              <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                {group}
              </div>
              <div className="space-y-0.5">
                {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
                  const active = view === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onNavigate(item.id);
                        onCloseMobile();
                      }}
                      className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                        active
                          ? 'bg-brand-600/90 text-white shadow-sm shadow-brand-900/40'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                      }`}
                    >
                      <span className={active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}>{item.icon}</span>
                      <span className="flex-1 truncate font-medium">{item.label}</span>
                      {item.id === 'performance' && openEscalations ? (
                        <span className="rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {openEscalations}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/5 p-3">
          <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-white/[0.03] p-2">
            <Avatar name={scope.user.name} color={scope.user.avatarColor} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-white">{scope.user.name}</div>
              <div className="truncate text-[10px] text-slate-400">{ROLE_LABELS[scope.user.role]}</div>
            </div>
            <ShieldCheck className="h-4 w-4 flex-none text-emerald-400/80" />
          </div>
          <p className="px-1 text-[10px] leading-relaxed text-slate-500">{describeScope(scope)}</p>
        </div>
      </aside>
    </>
  );
}

export function Topbar({
  view,
  onNavigate,
  onNewActivity,
  onToggleMobile,
  onGlobalSearch,
}: {
  view: ViewKey;
  onNavigate: (v: ViewKey) => void;
  onNewActivity: () => void;
  onToggleMobile: () => void;
  onGlobalSearch: () => void;
}) {
  const { state, scope, setActiveUser, resetDemo, workspace } = useStore();
  const [userMenu, setUserMenu] = useState(false);
  const [notifMenu, setNotifMenu] = useState(false);
  const active = NAV_ITEMS.find((i) => i.id === view);
  const openEscalations = state.escalations.filter((e) => e.status === 'open');
  const myAlerts = useMemo(
    () =>
      openEscalations.filter(
        (e) =>
          scope.visibleDepartmentIds.includes(e.departmentId) &&
          (scope.user.role !== 'department_head' || e.recipients.includes(scope.user.id)),
      ),
    [openEscalations, scope],
  );
  const sortedUsers = useMemo(
    () => [...state.employees].sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name)),
    [state.employees],
  );

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
        <button className="lg:hidden" onClick={onToggleMobile} aria-label="Open menu">
          <Menu className="h-5 w-5 text-slate-600" />
        </button>
        <div className="hidden min-w-0 items-center gap-2 text-xs text-slate-400 sm:flex">
          <span>Orbit</span>
          <span className="text-slate-300">/</span>
          <span className="truncate font-medium text-slate-600">{active?.label}</span>
        </div>
        <span className="ml-1 hidden truncate text-[11px] text-slate-400 xl:block">{active?.hint}</span>

        <div className="flex-1" />

        <button
          onClick={onGlobalSearch}
          className="hidden items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-600 md:flex"
        >
          Search people, tasks… <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[10px] text-slate-400">⌘K</kbd>
        </button>

        <div className="relative">
          <IconButton title="Escalations" onClick={() => setNotifMenu((v) => !v)} active={notifMenu}>
            <Bell className="h-4 w-4" />
            {myAlerts.length ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white">
                {myAlerts.length}
              </span>
            ) : null}
          </IconButton>
          {notifMenu ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNotifMenu(false)} />
              <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Escalations in your scope
                </div>
                {myAlerts.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-slate-400">No open escalations. All departments above threshold.</div>
                ) : (
                  myAlerts.map((e) => {
                    const dept = state.departments.find((d) => d.id === e.departmentId);
                    return (
                      <button
                        key={e.id}
                        onClick={() => {
                          setNotifMenu(false);
                          onNavigate('performance');
                        }}
                        className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-rose-500" />
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-slate-800">{dept?.name}</span>
                          <span className="block text-[11px] text-slate-500">
                            Score {e.score} vs threshold {e.threshold} · CC {state.employees.find((x) => x.id === e.cc[0])?.name ?? 'Head of Operations'}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : null}
        </div>

        <Button variant="primary" size="sm" onClick={onNewActivity} className="!px-2.5">
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New activity</span>
        </Button>

        <div className="relative">
          <button
            onClick={() => setUserMenu((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 py-1 pl-1 pr-1.5 transition-colors hover:bg-slate-50"
          >
            <Avatar name={scope.user.name} color={scope.user.avatarColor} size={26} />
            <div className="hidden text-left sm:block">
              <div className="max-w-[120px] truncate text-[11px] font-semibold leading-tight text-slate-800">{scope.user.name}</div>
              <div className="text-[10px] leading-tight text-slate-500">{ROLE_LABELS[scope.user.role]}</div>
            </div>
            <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />
          </button>
          {userMenu ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
              <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 px-3 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Switch demo persona</div>
                  <p className="mt-1 text-[11px] leading-snug text-slate-500">
                    Each role sees a different slice of the group. CEO and Head of Operations see every department.
                  </p>
                </div>
                <div className="max-h-80 overflow-y-auto p-1.5">
                  {sortedUsers.map((u) => {
                    const dept = state.departments.find((d) => d.id === u.departmentId);
                    return (
                      <button
                        key={u.id}
                        onClick={() => {
                          setActiveUser(u.id);
                          setUserMenu(false);
                          onNavigate('dashboard');
                        }}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
                          u.id === scope.user.id ? 'bg-brand-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <Avatar name={u.name} color={u.avatarColor} size={26} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-medium text-slate-800">{u.name}</span>
                          <span className="block truncate text-[10px] text-slate-500">
                            {ROLE_LABELS[u.role]} · {dept?.code}
                          </span>
                        </span>
                        {u.id === scope.user.id ? <Badge tone="brand">active</Badge> : null}
                      </button>
                    );
                  })}
                </div>
                {workspace.mode === 'demo' ? <div className="border-t border-slate-100 p-2">
                  <button
                    onClick={() => {
                      if (confirm('Reset all demo data to the seeded state? Local edits will be lost.')) {
                        resetDemo();
                        setUserMenu(false);
                      }
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Reset demo data
                  </button>
                </div> : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Scope ribbon */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 bg-slate-50/80 px-3 py-1.5 text-[10px] text-slate-500 sm:px-5">
        <span className="flex items-center gap-1 font-medium text-slate-600">
          <Users className="h-3 w-3" /> {describeScope(scope)}
        </span>
        <span className="hidden text-slate-300 sm:inline">|</span>
        <span>
          {scope.visibleDepartments.map((d) => d.code).join(' · ')}
        </span>
        <span className="ml-auto flex items-center gap-1 text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {workspace.mode === 'shared' ? 'Shared workspace · Neon database' : 'Demo workspace · local browser storage'}
        </span>
      </div>
    </header>
  );
}
