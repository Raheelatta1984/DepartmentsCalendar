import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronsDownUp,
  ChevronsUpDown,
  Crown,
  GitBranch,
  GripVertical,
  History,
  Layers,
  Link2Off,
  Search,
  Split,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { useStore } from '../store';
import { useToast } from '../components/toast';
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, SectionHeader, Tabs } from '../components/ui';
import { employeeTitle, ROLE_LABELS } from '../lib/permissions';
import {
  buildOrgTree,
  flattenOrg,
  orgBreadcrumb,
  orgChildrenMap,
  orgImpactSummary,
  orgStats,
  orgTeamIds,
  validateOrgMove,
  type OrgNode,
} from '../lib/org';
import type { Employee } from '../types';

type Tab = 'chart' | 'directory' | 'history';

const ROLE_TONE: Record<Employee['role'], string> = {
  ceo: 'purple',
  head_operations: 'brand',
  department_head: 'info',
  unit_head: 'info',
  manager: 'good',
  supervisor: 'neutral',
  employee: 'neutral',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export function OrganisationPage() {
  const { state, scope, moveReportingLine, tenant } = useStore();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('chart');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(scope.user.id);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');

  const canEdit = scope.canManageReportingLines;
  const employees = state.employees;
  const byId = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const departmentById = useMemo(() => new Map(state.departments.map((row) => [row.id, row])), [state.departments]);
  const streamById = useMemo(() => new Map(state.deliveryStreams.map((row) => [row.id, row])), [state.deliveryStreams]);
  const directReportsByManager = useMemo(() => orgChildrenMap(employees), [employees]);

  const tree = useMemo(() => buildOrgTree(employees), [employees]);
  const stats = useMemo(() => orgStats(employees), [employees]);

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (employee: Employee) =>
      !q || `${employee.name} ${employee.email} ${employeeTitle(employee)} ${employee.code}`.toLowerCase().includes(q),
    [q],
  );

  /* While searching, the chart shows the matching people with their reporting
     line above them, so a result is never shown without its context. */
  const visibleIds = useMemo(() => {
    if (!q) return null;
    const out = new Set<string>();
    employees.filter(matches).forEach((employee) => {
      out.add(employee.id);
      let current = employee.managerId ? byId.get(employee.managerId) : undefined;
      const seen = new Set<string>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        out.add(current.id);
        current = current.managerId ? byId.get(current.managerId) : undefined;
      }
    });
    return out;
  }, [q, employees, matches, byId]);

  const blocked = useMemo(() => (dragId ? orgTeamIds(employees, dragId) : new Set<string>()), [dragId, employees]);

  const commitMove = useCallback(
    (employeeId: string, managerId: string | null) => {
      const error = moveReportingLine(employeeId, managerId);
      if (error) {
        toast.push({ tone: 'error', title: 'Reporting line not changed', description: error });
        return false;
      }
      const person = byId.get(employeeId);
      const manager = managerId ? byId.get(managerId) : null;
      toast.push({
        tone: 'success',
        title: manager ? `${person?.name} now reports to ${manager.name}` : `${person?.name} is now at the top of the hierarchy`,
        description: 'Reporting line saved and audited. Department, stream and calendar access are unchanged.',
      });
      return true;
    },
    [moveReportingLine, toast, byId],
  );

  const onDrop = useCallback(
    (targetId: string | null) => {
      if (!dragId) return;
      const employee = byId.get(dragId);
      if (employee && employee.managerId === targetId) {
        toast.push({ tone: 'info', title: 'No change', description: `${employee.name} already reports to that person.` });
      } else {
        commitMove(dragId, targetId);
      }
      setDragId(null);
      setDropId(null);
    },
    [dragId, byId, commitMove, toast],
  );

  const endDrag = useCallback(() => {
    setDragId(null);
    setDropId(null);
  }, []);

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selected = selectedId ? byId.get(selectedId) : undefined;
  const pickerPerson = pickerFor ? byId.get(pickerFor) : undefined;

  useEffect(() => {
    if (selectedId && !byId.has(selectedId)) setSelectedId(null);
  }, [selectedId, byId]);

  const history = useMemo(
    () => state.auditLog.filter((entry) => entry.action === 'Reporting line changed'),
    [state.auditLog],
  );

  const renderNodes = (nodes: OrgNode[]): React.ReactNode =>
    nodes
      .filter((node) => !visibleIds || visibleIds.has(node.employee.id))
      .map((node) => {
        const employee = node.employee;
        const isDragging = dragId === employee.id;
        const isDropTarget = dropId === employee.id;
        const isBlocked = Boolean(dragId) && blocked.has(employee.id);
        const isOpen = q ? true : !collapsed.has(employee.id);
        const direct = directReportsByManager.get(employee.id) ?? [];
        const isActiveUser = employee.id === scope.user.id;
        const isSelected = employee.id === selectedId;

        return (
          <li key={employee.id} className="relative">
            <div
              role="treeitem"
              aria-level={node.depth + 1}
              aria-selected={isSelected}
              aria-expanded={direct.length ? isOpen : undefined}
              draggable={canEdit}
              tabIndex={0}
              onDragStart={(event) => {
                if (!canEdit) return;
                setDragId(employee.id);
                event.dataTransfer.setData('text/plain', employee.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={endDrag}
              onDragOver={(event) => {
                if (!dragId || isBlocked) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (dropId !== employee.id) setDropId(employee.id);
              }}
              onDragLeave={() => {
                if (dropId === employee.id) setDropId(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (isBlocked) {
                  const reason = validateOrgMove(employees, dragId ?? '', employee.id).reason;
                  toast.push({ tone: 'error', title: 'Cannot drop there', description: reason });
                  endDrag();
                  return;
                }
                onDrop(employee.id);
              }}
              onClick={() => setSelectedId(employee.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canEdit) {
                  event.preventDefault();
                  setPickerQuery('');
                  setPickerFor(employee.id);
                }
              }}
              className={`group relative rounded-xl border bg-white p-3 text-left transition-shadow ${
                isSelected ? 'border-brand-300 ring-1 ring-brand-200' : 'border-slate-200/80'
              } ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${
                isDragging ? 'opacity-40' : 'shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
              } ${isDropTarget && !isBlocked ? 'border-brand-400 ring-2 ring-brand-200' : ''} ${
                isBlocked ? 'border-dashed border-rose-200 opacity-60' : ''
              }`}
            >
              <div className="flex items-start gap-2.5">
                {canEdit ? (
                  <GripVertical className="mt-1 h-3.5 w-3.5 flex-none text-slate-300 group-hover:text-slate-400" aria-hidden />
                ) : null}
                <Avatar name={employee.name} color={employee.avatarColor} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-slate-900">{employee.name}</span>
                    {isActiveUser ? <Badge tone="brand">you</Badge> : null}
                    {employee.status === 'on_leave' ? <Badge tone="warn">on leave</Badge> : null}
                    {employee.status === 'inactive' ? <Badge tone="neutral">inactive</Badge> : null}
                    {employee.employmentType === 'contractor' ? <Badge tone="neutral">contractor</Badge> : null}
                  </div>
                  <div className="truncate text-[11px] font-medium text-slate-600">{employeeTitle(employee)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge tone={ROLE_TONE[employee.role]}>{ROLE_LABELS[employee.role]}</Badge>
                    <span className="text-[10px] text-slate-400">
                      {departmentById.get(employee.departmentId)?.name ?? 'No department'}
                      {employee.streamId ? ` · ${streamById.get(employee.streamId)?.name ?? 'stream'}` : ''}
                    </span>
                  </div>
                </div>
                <div className="hidden flex-none text-right sm:block">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Team</div>
                  <div className="text-sm font-semibold tabular-nums text-slate-800">{node.teamSize}</div>
                  <div className="text-[9px] text-slate-400">
                    {direct.length} direct
                  </div>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (employee.managerId) setSelectedId(employee.managerId);
                  }}
                  className="flex min-w-0 items-center gap-1 text-[10px] text-slate-400 hover:text-slate-700"
                  title={employee.managerId ? `Reports to ${byId.get(employee.managerId)?.name ?? 'unknown'}` : 'Top of the hierarchy'}
                >
                  <ArrowRight className="h-3 w-3 flex-none" />
                  <span className="truncate">
                    {employee.managerId ? `Reports to ${byId.get(employee.managerId)?.name ?? 'unknown'}` : 'Top of the hierarchy'}
                  </span>
                </button>
                <div className="flex flex-none items-center gap-1">
                  {direct.length ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleCollapsed(employee.id);
                      }}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      aria-label={isOpen ? `Hide ${employee.name}'s reports` : `Show ${employee.name}'s reports`}
                    >
                      {isOpen ? 'Hide' : 'Show'} {direct.length} report{direct.length === 1 ? '' : 's'}
                    </button>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPickerQuery('');
                        setPickerFor(employee.id);
                      }}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-brand-700 hover:bg-brand-50"
                    >
                      <UserCog className="h-3 w-3" /> Change reporting lead
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {direct.length ? (
              <div className={`${isOpen ? '' : 'hidden'} ml-4 mt-2 border-l border-slate-200 pl-3 sm:ml-6 sm:pl-4`}>
                <ul role="group" className="space-y-2" aria-label={`${employee.name}'s reports`}>
                  {renderNodes(node.children)}
                </ul>
              </div>
            ) : null}
          </li>
        );
      });

  return (
    <div>
      <PageHeader
        eyebrow="Organisation"
        title="Who reports to whom"
        description={`The reporting-line hierarchy for ${tenant?.name ?? state.settings.groupName}, derived from the employee register. Drag anyone onto a new reporting lead — or onto the top-level drop zone — to re-parent them. Their team moves with them, and department, stream and calendar access stay exactly as they were.`}
        actions={
          <>
            <Button size="sm" onClick={() => { setCollapsed(new Set()); setQuery(''); }}>
              <ChevronsUpDown className="h-3.5 w-3.5" /> Expand all
            </Button>
            <a href="#/admin">
              <Button size="sm" variant="primary">
                <UserPlus className="h-3.5 w-3.5" /> People &amp; master data
              </Button>
            </a>
          </>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: <Users className="h-4 w-4" />, label: 'People in scope', value: stats.headcount, hint: `${stats.topLevel} at the top level` },
          { icon: <Layers className="h-4 w-4" />, label: 'Reporting layers', value: stats.layers, hint: `Widest span ${stats.widestSpan} direct reports` },
          { icon: <GitBranch className="h-4 w-4" />, label: 'Reporting leads', value: stats.managers, hint: `${stats.individualContributors} individual contributors` },
          { icon: <History className="h-4 w-4" />, label: 'Line changes logged', value: history.length, hint: 'Audited in Master setup' },
        ].map((card) => (
          <Card key={card.label} className="!py-3">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="rounded-md bg-slate-100 p-1.5">{card.icon}</span>
              <span className="text-[10px] font-medium uppercase tracking-wider">{card.label}</span>
            </div>
            <div className="mt-1.5 text-xl font-semibold tabular-nums text-slate-900">{card.value}</div>
            <div className="text-[10px] text-slate-400">{card.hint}</div>
          </Card>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs<Tab>
          tabs={[
            { id: 'chart', label: 'Hierarchy chart' },
            { id: 'directory', label: 'Reporting directory', count: employees.length },
            { id: 'history', label: 'Line changes', count: history.length },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab !== 'history' ? (
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a person, title or code…"
              className="pl-8"
              aria-label="Search the hierarchy"
            />
          </div>
        ) : null}
        {!canEdit ? <Badge tone="warn">read-only · you can view but not re-parent</Badge> : null}
      </div>

      {tab === 'chart' ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Card padded={false} className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <SectionHeader
                title="Reporting hierarchy"
                subtitle={
                  canEdit
                    ? 'Drag a card onto a colleague to make them the reporting lead. Dark cards with a rose outline are the dragged person’s own team and cannot be dropped on.'
                    : 'Your access tier can view the hierarchy. An executive, department head or unit head can change reporting lines.'
                }
              />
              <Button size="sm" onClick={() => setCollapsed(new Set(flattenOrg(tree).map((node) => node.employee.id)))}>
                <ChevronsDownUp className="h-3.5 w-3.5" /> Collapse all
              </Button>
            </div>

            {canEdit ? (
              <div className="px-3 pt-3">
                <div
                  onDragOver={(event) => {
                    if (!dragId) return;
                    event.preventDefault();
                    if (dropId !== '__root__') setDropId('__root__');
                  }}
                  onDragLeave={() => {
                    if (dropId === '__root__') setDropId(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    onDrop(null);
                  }}
                  className={`flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 transition-colors ${
                    dropId === '__root__' ? 'border-brand-400 bg-brand-50' : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <Crown className="h-4 w-4 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-700">Top of the hierarchy</div>
                    <div className="text-[10px] text-slate-500">
                      Drop a person here to remove their reporting lead. Their reports stay beneath them.
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400">{stats.topLevel} currently unanchored</span>
                </div>
              </div>
            ) : null}

            <div className="p-3">
              {!tree.length ? (
                <EmptyState
                  title="No people in this workspace yet"
                  description="Add employees in Master setup, then draw the reporting lines here."
                  action={
                    <a href="#/admin">
                      <Button size="sm" variant="primary">Open Master setup</Button>
                    </a>
                  }
                />
              ) : (
                <ul role="tree" aria-label="Reporting hierarchy" className="space-y-2">
                  {renderNodes(tree)}
                </ul>
              )}
              {q && visibleIds && !visibleIds.size ? (
                <p className="px-1 py-4 text-xs text-slate-500">No person matches “{query}”.</p>
              ) : null}
            </div>
          </Card>

          <div className="space-y-3">
            <Card>
              <SectionHeader title="Selected person" subtitle="Click any card to inspect the line above and below." />
              {selected ? (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={selected.name} color={selected.avatarColor} size={40} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{selected.name}</div>
                      <div className="truncate text-[11px] text-slate-500">{employeeTitle(selected)}</div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50/80 p-2.5">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Reporting line</div>
                    <div className="mt-1 text-[11px] leading-relaxed text-slate-700">
                      {orgBreadcrumb(employees, selected.id)}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-400">
                      {orgDepthLabel(employees, selected.id)}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">Direct reports</div>
                      <div className="text-sm font-semibold tabular-nums text-slate-800">
                        {(directReportsByManager.get(selected.id) ?? []).length}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 px-2.5 py-2">
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">Whole team</div>
                      <div className="text-sm font-semibold tabular-nums text-slate-800">
                        {orgTeamIds(employees, selected.id).size}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Direct reports</div>
                      <span className="text-[10px] text-slate-400">{departmentById.get(selected.departmentId)?.name}</span>
                    </div>
                    <div className="space-y-1">
                      {(directReportsByManager.get(selected.id) ?? []).map((report) => (
                        <button
                          key={report.id}
                          type="button"
                          onClick={() => setSelectedId(report.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-slate-50"
                        >
                          <Avatar name={report.name} color={report.avatarColor} size={22} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-medium text-slate-800">{report.name}</span>
                            <span className="block truncate text-[9px] text-slate-500">{employeeTitle(report)}</span>
                          </span>
                          <ArrowRight className="h-3 w-3 flex-none text-slate-300" />
                        </button>
                      ))}
                      {!(directReportsByManager.get(selected.id) ?? []).length ? (
                        <p className="px-1 text-[10px] text-slate-400">No direct reports.</p>
                      ) : null}
                    </div>
                  </div>

                  {canEdit ? (
                    <div className="space-y-1.5">
                      <Button
                        size="sm"
                        variant="primary"
                        className="w-full"
                        onClick={() => {
                          setPickerQuery('');
                          setPickerFor(selected.id);
                        }}
                      >
                        <UserCog className="h-3.5 w-3.5" /> Change reporting line
                      </Button>
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={!selected.managerId}
                        onClick={() => commitMove(selected.id, null)}
                      >
                        <Crown className="h-3.5 w-3.5" /> Make top level
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Pick a card in the chart to see their reporting line.</p>
              )}
            </Card>

            <Card>
              <SectionHeader title="Move impact" subtitle="What travels with a person when you re-parent them." />
              <ul className="mt-2 space-y-1.5 text-[11px] leading-snug text-slate-600">
                <li className="flex gap-1.5">
                  <ArrowRight className="mt-0.5 h-3 w-3 flex-none text-brand-500" />
                  Reporting line only — department, entity and delivery stream do not change.
                </li>
                <li className="flex gap-1.5">
                  <ArrowRight className="mt-0.5 h-3 w-3 flex-none text-brand-500" />
                  Their whole team moves with them; nobody is lifted out of the subtree.
                </li>
                <li className="flex gap-1.5">
                  <ArrowRight className="mt-0.5 h-3 w-3 flex-none text-brand-500" />
                  Reporting-line visibility follows the new line immediately, so timesheet approvals and team scope update with it.
                </li>
                <li className="flex gap-1.5">
                  <Link2Off className="mt-0.5 h-3 w-3 flex-none text-rose-400" />
                  A move that would loop the hierarchy (a manager under their own report) is refused.
                </li>
              </ul>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'directory' ? (
        <Card padded={false}>
          <div className="px-4 pt-4">
            <SectionHeader
              title="Reporting directory"
              subtitle="One row per person with the line above them. Expand a row to see their team; use Change reporting lead for a keyboard-friendly alternative to dragging."
            />
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  {['Person', 'Designation', 'Reports to', 'Line', 'Depth', 'Team', 'Change'].map((heading) => (
                    <th
                      key={heading}
                      className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4 backdrop-blur"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flattenOrg(tree)
                  .filter((node) => matches(node.employee))
                  .map((node) => {
                    const employee = node.employee;
                    const manager = employee.managerId ? byId.get(employee.managerId) : undefined;
                    return (
                      <tr key={employee.id} className="group hover:bg-slate-50/70">
                        <td className="border-b border-slate-100 py-2 pl-4 pr-3">
                          <div className="flex items-center gap-2" style={{ paddingLeft: `${node.depth * 12}px` }}>
                            <Avatar name={employee.name} color={employee.avatarColor} size={26} />
                            <div className="min-w-0">
                              <div className="truncate text-[11px] font-semibold text-slate-800">{employee.name}</div>
                              <div className="truncate text-[9px] text-slate-400">
                                {initials(employee.name)} · {employee.code}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          <div className="text-[11px] font-medium text-slate-700">{employeeTitle(employee)}</div>
                          <div className="text-[9px] text-slate-400">{departmentById.get(employee.departmentId)?.name}</div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-600">
                          {manager?.name ?? <span className="text-slate-400">Top level</span>}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-[10px] text-slate-500">
                          {orgBreadcrumb(employees, employee.id)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-[11px] tabular-nums text-slate-600">{node.depth}</td>
                        <td className="border-b border-slate-100 px-3 py-2 text-[11px] tabular-nums text-slate-600">
                          {node.teamSize}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!canEdit}
                            onClick={() => {
                              setPickerQuery('');
                              setPickerFor(employee.id);
                            }}
                          >
                            <Split className="h-3 w-3" /> Change
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === 'history' ? (
        <Card>
          <SectionHeader
            title="Reporting-line changes"
            subtitle="Every re-parent is written to the workspace audit trail, so the structure can always be explained."
          />
          <div className="mt-3 space-y-1.5">
            {history.slice(0, 60).map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-100 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[11px] font-medium text-slate-700">{entry.detail}</span>
                  <span className="text-[9px] tabular-nums text-slate-400">
                    {entry.at.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
                <div className="text-[9px] text-slate-400">By {byId.get(entry.actorId)?.name ?? 'System'}</div>
              </div>
            ))}
            {!history.length ? (
              <EmptyState
                title="No line changes yet"
                description="Move somebody on the chart or in the directory and the change appears here with who made it."
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      <ChangeManagerModal
        open={Boolean(pickerPerson)}
        person={pickerPerson}
        employees={employees}
        byId={byId}
        departmentById={departmentById}
        query={pickerQuery}
        onQuery={setPickerQuery}
        canEdit={canEdit}
        onClose={() => setPickerFor(null)}
        onConfirm={(managerId) => {
          if (!pickerPerson) return;
          if (commitMove(pickerPerson.id, managerId)) setPickerFor(null);
        }}
      />
    </div>
  );
}

function orgDepthLabel(employees: Employee[], employeeId: string): string {
  const depth = Math.max(0, orgBreadcrumb(employees, employeeId).split(' → ').length - 1);
  if (depth === 0) return 'Top of the hierarchy';
  return `${depth} reporting layer${depth === 1 ? '' : 's'} below the top`;
}

function ChangeManagerModal({
  open,
  person,
  employees,
  byId,
  departmentById,
  query,
  onQuery,
  canEdit,
  onClose,
  onConfirm,
}: {
  open: boolean;
  person: Employee | undefined;
  employees: Employee[];
  byId: Map<string, Employee>;
  departmentById: Map<string, { name: string }>;
  query: string;
  onQuery: (value: string) => void;
  canEdit: boolean;
  onClose: () => void;
  onConfirm: (managerId: string | null) => void;
}) {
  const q = query.trim().toLowerCase();
  const options = employees
    .filter((employee) => employee.id !== person?.id)
    .filter((employee) => !q || `${employee.name} ${employeeTitle(employee)}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !person) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-2 backdrop-blur-sm sm:p-8">
      <div className="animate-fade-up flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-4rem)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">Change reporting line</h3>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {person.name} · {orgImpactSummary(employees, person.id)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Search a reporting lead by name or designation…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <button
            type="button"
            disabled={!person.managerId || !canEdit}
            onClick={() => onConfirm(null)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50 disabled:opacity-40"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Crown className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-slate-800">Top of the hierarchy</span>
              <span className="block text-[10px] text-slate-500">
                {person.managerId ? 'Remove their manager — their team stays with them.' : 'Already at the top level.'}
              </span>
            </span>
          </button>

          <div className="my-1 border-t border-slate-100" />

          {options.map((option) => {
            const check = validateOrgMove(employees, person.id, option.id);
            const current = person.managerId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={!check.ok || !canEdit}
                title={check.ok ? check.reason : check.reason}
                onClick={() => onConfirm(option.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                  check.ok ? 'hover:bg-brand-50/70' : 'cursor-not-allowed opacity-45'
                } ${current ? 'bg-brand-50/60' : ''}`}
              >
                <Avatar name={option.name} color={option.avatarColor} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold text-slate-800">
                    {option.name}
                    {current ? <span className="ml-1 text-[9px] font-medium text-brand-600">current reporting lead</span> : null}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500">
                    {employeeTitle(option)} · {departmentById.get(option.departmentId)?.name ?? 'No department'}
                  </span>
                  {!check.ok ? <span className="block truncate text-[9px] text-rose-500">{check.reason}</span> : null}
                </span>
                <Building2 className="h-3 w-3 flex-none text-slate-300" />
              </button>
            );
          })}
          {!options.length ? <p className="px-2 py-4 text-xs text-slate-500">No other person matches that search.</p> : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2.5">
          <span className="text-[10px] text-slate-500">
            {byId.get(person.managerId ?? '')?.name
              ? `Currently reports to ${byId.get(person.managerId!)?.name}`
              : 'Currently at the top level'}
          </span>
          <Button size="sm" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
