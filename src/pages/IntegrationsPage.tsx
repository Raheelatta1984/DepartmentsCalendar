import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  Check,
  CheckCircle2,
  Cloud,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  Plug,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Unplug,
  Users,
  X,
} from 'lucide-react';
import { useScopedState, useStore, newId } from '../store';
import type { CalendarProvider, SyncJob } from '../types';
import { canLogForEmployee } from '../lib/permissions';
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchInput, SectionHeader, Select, Tabs, Toggle } from '../components/ui';
import { downloadICS } from '../lib/export';
import { useToast } from '../components/toast';

const PROVIDER_META: Record<CalendarProvider, { name: string; vendor: string; color: string; bg: string; scopes: string[]; note: string }> = {
  outlook: {
    name: 'Outlook / Microsoft 365',
    vendor: 'Microsoft Graph',
    color: '#0f6cbd',
    bg: 'bg-[#0f6cbd]/5',
    scopes: ['Calendars.ReadWrite', 'User.Read', 'offline_access', 'Mail.Send (escalations)'],
    note: 'One tenant-wide app registration with delegated consent. Events are written to the assignee mailbox; cancellations remove the event.',
  },
  google: {
    name: 'Google Calendar',
    vendor: 'Google Calendar API v3',
    color: '#1a73e8',
    bg: 'bg-[#1a73e8]/5',
    scopes: ['https://www.googleapis.com/auth/calendar.events', 'userinfo.email'],
    note: 'Optional per employee. Uses OAuth off-line access so the sync worker can refresh tokens without the user present.',
  },
};

export function IntegrationsPage() {
  const { scope, connectCalendar, disconnectCalendar, pushToCalendars, resetDemo  } = useStore();
  /* Operational rows come from the active tenant, cut down to the departments
     the calendar is implemented for (master setting: one / several / all). */
  const state = useScopedState();
  const toast = useToast();
  const [connectDraft, setConnectDraft] = useState<{ employeeId: string; provider: CalendarProvider; email: string; twoWay: boolean } | null>(null);
  const [filterProvider, setFilterProvider] = useState<'all' | CalendarProvider>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'connected' | 'pending' | 'disconnected'>('all');
  const [query, setQuery] = useState('');
  const [jobFilter, setJobFilter] = useState<'all' | 'synced' | 'failed' | 'queued'>('all');

  const empMap = useMemo(() => new Map(state.employees.map((e) => [e.id, e])), [state.employees]);
  const activityMap = useMemo(() => new Map(state.activities.map((a) => [a.id, a])), [state.activities]);
  const manageableEmployeeIds = useMemo(
    () => state.employees.filter((employee) => canLogForEmployee(state, scope.user.id, employee.id)).map((employee) => employee.id),
    [state, scope.user.id],
  );

  const connections = useMemo(
    () =>
      state.connections
        .filter((c) => manageableEmployeeIds.includes(c.employeeId))
        .filter((c) => (filterProvider === 'all' ? true : c.provider === filterProvider))
        .filter((c) => (filterStatus === 'all' ? true : c.status === filterStatus))
        .filter((c) => (query ? `${empMap.get(c.employeeId)?.name} ${c.accountEmail}`.toLowerCase().includes(query.toLowerCase()) : true))
        .sort((a, b) => (a.status === 'connected' ? -1 : 1) - (b.status === 'connected' ? -1 : 1)),
    [state.connections, manageableEmployeeIds, filterProvider, filterStatus, query, empMap],
  );

  const jobs = useMemo(
    () =>
      state.syncJobs
        .filter((j) => {
          const act = activityMap.get(j.activityId);
          return act ? manageableEmployeeIds.includes(act.assigneeId) : false;
        })
        .filter((j) => (jobFilter === 'all' ? true : j.status === jobFilter))
        .slice(0, 50),
    [state.syncJobs, activityMap, manageableEmployeeIds, jobFilter],
  );

  const stats = (provider: CalendarProvider) => {
    const all = state.connections.filter((c) => c.provider === provider && manageableEmployeeIds.includes(c.employeeId));
    const connected = all.filter((c) => c.status === 'connected');
    return { total: all.length, connected: connected.length, pending: all.filter((c) => c.status === 'pending').length, last: connected.map((c) => c.lastSync).filter(Boolean).sort().reverse()[0] };
  };

  const outlookStats = stats('outlook');
  const googleStats = stats('google');
  const coverage = Math.round((outlookStats.connected / Math.max(1, manageableEmployeeIds.length)) * 100);

  return (
    <div>
      <PageHeader
        eyebrow="Integrations"
        title="Outlook & Google Calendar sync"
        description="Activities entered in Orbit are mirrored into each employee's corporate calendar. Outlook is the default channel; Google is optional per person, department or entity."
        actions={
          <>
            <Button
              size="sm"
              onClick={() => {
                downloadICS(
                  state.activities.filter((a) => scope.visibleEmployeeIds.includes(a.assigneeId)),
                  state.employees,
                  'orbit-portal.ics',
                );
                toast.push({ tone: 'info', title: 'Universal fallback exported', description: '.ics files import into Outlook, Google or Apple calendars without any API setup.' });
              }}
            >
              <Download className="h-3.5 w-3.5" /> Export .ics fallback
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => setConnectDraft({ employeeId: scope.user.id, provider: 'outlook', email: scope.user.email, twoWay: true })}
            >
              <Link2 className="h-3.5 w-3.5" /> Connect calendar
            </Button>
          </>
        }
      />

      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        {(['outlook', 'google'] as CalendarProvider[]).map((provider) => {
          const meta = PROVIDER_META[provider];
          const s = provider === 'outlook' ? outlookStats : googleStats;
          return (
            <Card key={provider} className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: meta.color }} />
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white" style={{ background: meta.color }}>
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-semibold text-slate-900">{meta.name}</h3>
                      <Badge tone={s.connected ? 'good' : 'warn'}>{s.connected ? 'connected' : 'not connected'}</Badge>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {meta.vendor} · {s.connected}/{s.total} people · {s.pending} pending consent
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      Last sync {s.last ? new Date(s.last).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={s.connected ? 'secondary' : 'primary'}
                  onClick={() => setConnectDraft({ employeeId: scope.user.id, provider, email: scope.user.email, twoWay: provider === 'outlook' })}
                >
                  <Plug className="h-3.5 w-3.5" /> {s.connected ? 'Add person' : 'Connect'}
                </Button>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-slate-600">{meta.note}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {meta.scopes.map((sc) => (
                  <span key={sc} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">
                    {sc}
                  </span>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="!py-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Outlook coverage</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{coverage}%</div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#0f6cbd]" style={{ width: `${coverage}%` }} />
          </div>
        </Card>
        <Card className="!py-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Events queued today</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{state.syncJobs.filter((j) => j.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length}</div>
          <div className="text-[10px] text-slate-400">write / update / delete operations</div>
        </Card>
        <Card className="!py-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Failed operations</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-rose-600">{state.syncJobs.filter((j) => j.status === 'failed').length}</div>
          <div className="text-[10px] text-slate-400">token expiry or mailbox permission</div>
        </Card>
        <Card className="!py-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Two-way sync</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{state.connections.filter((c) => c.twoWay && c.status === 'connected').length}</div>
          <div className="text-[10px] text-slate-400">people with write-back enabled</div>
        </Card>
      </div>

      <Card padded={false} className="mb-3">
        <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-4">
          <SectionHeader title="Employee calendar connections" subtitle="Manage one mailbox at a time, or roll out by department" />
          <div className="flex flex-wrap gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Find employee" className="w-[180px]" />
            <div className="w-[150px]">
              <Select value={filterProvider} onChange={(e) => setFilterProvider(e.target.value as typeof filterProvider)}>
                <option value="all">All providers</option>
                <option value="outlook">Outlook</option>
                <option value="google">Google</option>
              </Select>
            </div>
            <div className="w-[150px]">
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}>
                <option value="all">Any status</option>
                <option value="connected">Connected</option>
                <option value="pending">Pending</option>
                <option value="disconnected">Disconnected</option>
              </Select>
            </div>
          </div>
        </div>
        <div className="mt-3 max-h-[40vh] overflow-auto">
          <table className="w-full min-w-[860px] border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                {['Employee', 'Provider', 'Account', 'Status', 'Two-way', 'Last sync', ''].map((h) => (
                  <th key={h} className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => {
                const emp = empMap.get(c.employeeId);
                const meta = PROVIDER_META[c.provider];
                return (
                  <tr key={c.id} className="group hover:bg-slate-50/70">
                    <td className="border-b border-slate-100 py-2 pl-4 pr-3">
                      <div className="flex items-center gap-1.5">
                        <Avatar name={emp?.name ?? ''} color={emp?.avatarColor} size={22} />
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-medium text-slate-800">{emp?.name}</div>
                          <div className="text-[9px] text-slate-400">{state.departments.find((d) => d.id === emp?.departmentId)?.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: meta.color }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                        {c.provider === 'outlook' ? 'Outlook' : 'Google'}
                      </span>
                    </td>
                    <td className="max-w-[230px] truncate border-b border-slate-100 px-3 py-2 text-[10px] text-slate-500">{c.accountEmail}</td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <Badge tone={c.status === 'connected' ? 'good' : c.status === 'pending' ? 'warn' : 'neutral'}>{c.status}</Badge>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-[10px] text-slate-500">{c.twoWay ? 'read + write' : 'read only'}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-[9px] tabular-nums text-slate-400">
                      {c.lastSync ? new Date(c.lastSync).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="border-b border-slate-100 py-2 pl-2 pr-4">
                      <div className="flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                        {c.status === 'connected' ? (
                          <button
                            onClick={() => {
                              pushToCalendars(state.activities.find((a) => a.assigneeId === c.employeeId)?.id ?? '', [c.provider]);
                              toast.push({ tone: 'success', title: 'Sync request queued', description: `${emp?.name} · ${c.provider}` });
                            }}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                            title="Sync now"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setConnectDraft({ employeeId: c.employeeId, provider: c.provider, email: c.accountEmail, twoWay: c.provider === 'outlook' })}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                            title="Connect"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            disconnectCalendar(c.employeeId, c.provider);
                            toast.push({ tone: 'info', title: 'Calendar disconnected', description: 'Existing events stay, future changes stop syncing.' });
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Disconnect"
                        >
                          <Unplug className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {connections.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<Plug className="h-5 w-5" />} title="No connections match" description="Clear the filters or connect an employee calendar." />
          </div>
        ) : null}
      </Card>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2" padded={false}>
          <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-4">
            <SectionHeader title="Sync activity log" subtitle="Every write is idempotent — the activity ID is the calendar event UID" />
            <Tabs
              tabs={[
                { id: 'all', label: 'All' },
                { id: 'synced', label: 'Synced' },
                { id: 'queued', label: 'Queued' },
                { id: 'failed', label: 'Failed' },
              ]}
              value={jobFilter}
              onChange={(v) => setJobFilter(v as typeof jobFilter)}
            />
          </div>
          <div className="mt-2 max-h-[360px] overflow-auto">
            <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  {['Activity', 'Provider', 'Action', 'Status', 'Time', 'Detail'].map((h) => (
                    <th key={h} className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-slate-50/70">
                    <td className="max-w-[180px] truncate border-b border-slate-100 py-2 pl-4 pr-3 text-[10.5px] font-medium text-slate-800">
                      {activityMap.get(j.activityId)?.title ?? 'Deleted activity'}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <Badge tone={j.provider === 'outlook' ? 'info' : 'good'}>{j.provider}</Badge>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-[10px] capitalize text-slate-500">{j.action}</td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <Badge tone={j.status === 'synced' ? 'good' : j.status === 'failed' ? 'danger' : 'warn'}>
                        {j.status === 'synced' ? <CheckCircle2 className="h-3 w-3" /> : j.status === 'failed' ? <X className="h-3 w-3" /> : <Loader2 className="h-3 w-3" />}
                        {j.status}
                      </Badge>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-[9px] tabular-nums text-slate-400">
                      {new Date(j.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="max-w-[220px] truncate border-b border-slate-100 px-3 py-2 text-[9.5px] text-slate-500" title={j.message}>
                      {j.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {jobs.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No sync records for this filter" description="Create an activity with calendar sync enabled." />
            </div>
          ) : null}
        </Card>

        <div className="space-y-3">
          <Card>
            <SectionHeader title="Production checklist" subtitle="Shared hosting is available; real calendar OAuth is still a separate phase" />
            <ol className="mt-2 space-y-2">
              {[
                { title: 'Neon Free project', detail: 'Shared PostgreSQL storage through server-only Vercel functions. See docs/DEPLOYMENT.md.' },
                { title: 'Entra ID app registration', detail: 'Delegated Calendars.ReadWrite. Free with any Microsoft 365 tenant.' },
                { title: 'Google Cloud OAuth client', detail: 'Calendar API enabled; test users can be added without verification for internal apps.' },
                { title: 'Individual authentication & sync worker', detail: 'Not implemented: add SSO, server-side role checks and a durable queue before using real employee data.' },
                { title: 'Existing Vercel deployment', detail: 'GitHub main deploys the SPA and API together. Hobby eligibility and quotas depend on your usage.' },
              ].map((s, i) => (
                <li key={s.title} className="flex gap-2">
                  <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-brand-100 text-[9px] font-bold text-brand-700">{i + 1}</span>
                  <span>
                    <span className="block text-[11px] font-medium text-slate-800">{s.title}</span>
                    <span className="block text-[10px] leading-snug text-slate-500">{s.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <SectionHeader title="Sync policy" subtitle="Applied to every new activity" />
            <div className="mt-2 space-y-2">
              <Toggle checked label="Create event when activity is saved" onChange={() => undefined} description="Activity ID becomes the iCal UID, so updates never duplicate." />
              <Toggle checked label="Remove event when activity is deleted" onChange={() => undefined} description="Deletes are soft in the database, hard in the mailbox." />
              <Toggle checked={false} label="Push Orbit from calendar edits" onChange={() => undefined} description="Requires Graph change notifications (webhooks) — planned for phase 2." />
            </div>
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] text-amber-800">
              <ShieldCheck className="mt-0.5 h-3 w-3 flex-none" />
              Only the assignee and their reporting line can see an employee's calendar; executives see aggregated hours first, then detail on demand.
            </div>
          </Card>

          <Card>
            <SectionHeader title="Troubleshooting" subtitle="Most common failures" />
            <div className="mt-2 space-y-2 text-[10px]">
              {[
                { code: '401 invalid_grant', fix: 'Refresh token expired or admin revoked consent — reconnect the mailbox.' },
                { code: '403 ErrorAccessDenied', fix: 'App lacks Calendars.ReadWrite or the mailbox is on a different tenant.' },
                { code: '409 duplicate UID', fix: 'Event exists outside Orbit; import the .ics to reconcile or reassign UID.' },
              ].map((e) => (
                <div key={e.code} className="rounded-lg border border-slate-100 bg-slate-50/70 px-2 py-1.5">
                  <div className="font-mono text-[9px] font-semibold text-slate-700">{e.code}</div>
                  <div className="mt-0.5 text-slate-500">{e.fix}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={!!connectDraft}
        onClose={() => setConnectDraft(null)}
        title="Connect a calendar"
        subtitle="In this demo the OAuth handshake is simulated. In production this button opens the Microsoft or Google consent screen."
        width="max-w-lg"
        footer={
          <>
            <Button size="sm" onClick={() => setConnectDraft(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                if (!connectDraft) return;
                connectCalendar({
                  id: newId('conn'),
                  employeeId: connectDraft.employeeId,
                  provider: connectDraft.provider,
                  accountEmail: connectDraft.email,
                  status: 'connected',
                  lastSync: new Date().toISOString(),
                  twoWay: connectDraft.twoWay,
                });
                const emp = empMap.get(connectDraft.employeeId);
                toast.push({
                  tone: 'success',
                  title: 'Calendar connected',
                  description: `${emp?.name} · ${connectDraft.provider === 'outlook' ? 'Microsoft 365' : 'Google Calendar'}. Future activities will be mirrored automatically.`,
                });
                setConnectDraft(null);
              }}
            >
              <Check className="h-3.5 w-3.5" /> Authorise & connect
            </Button>
          </>
        }
      >
        {connectDraft ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Employee">
                <Select
                  value={connectDraft.employeeId}
                  onChange={(e) => {
                    const emp = state.employees.find((x) => x.id === e.target.value);
                    setConnectDraft({ ...connectDraft, employeeId: e.target.value, email: emp?.email ?? connectDraft.email });
                  }}
                >
                  {state.employees.filter((e) => manageableEmployeeIds.includes(e.id)).map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Provider">
                <Select value={connectDraft.provider} onChange={(e) => setConnectDraft({ ...connectDraft, provider: e.target.value as CalendarProvider })}>
                  <option value="outlook">Outlook / Microsoft 365</option>
                  <option value="google">Google Calendar</option>
                </Select>
              </Field>
            </div>
            <Field label="Calendar account email">
              <Input value={connectDraft.email} onChange={(e) => setConnectDraft({ ...connectDraft, email: e.target.value })} />
            </Field>
            <Toggle
              checked={connectDraft.twoWay}
              onChange={(v) => setConnectDraft({ ...connectDraft, twoWay: v })}
              label="Two-way sync"
              description="Also pull calendar events created outside Orbit back into the employee's schedule (phase 2 feature)."
            />
            <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Permissions requested</div>
              <ul className="mt-1 space-y-1">
                {PROVIDER_META[connectDraft.provider].scopes.map((s) => (
                  <li key={s} className="flex items-center gap-1.5 font-mono text-[9.5px] text-slate-600">
                    <Check className="h-2.5 w-2.5 text-emerald-500" /> {s}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-brand-50 px-2.5 py-2 text-[10px] text-brand-800">
              <AlertTriangle className="mt-0.5 h-3 w-3 flex-none" />
              Demo mode: no tokens are stored and no real mailbox is touched. The sync log shows exactly what the production worker would send.
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
