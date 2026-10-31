import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Check,
  Download,
  Globe2,
  GripHorizontal,
  Landmark,
  Network,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Shield,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { useStore, newId } from '../store';
import type { CalendarScopeMode, DeliveryStream, Department, Designation, Employee, EmploymentType, Entity, Holiday, Role, Tenant, WorkLocation } from '../types';
import { employeeTitle, ROLE_LABELS, ROLE_RANK } from '../lib/permissions';
import {
  CALENDAR_SCOPE_HINTS,
  CALENDAR_SCOPE_LABELS,
  describeCalendarScope,
  normaliseCalendarScope,
  tenantDepartments,
  tenantStats,
} from '../lib/tenants';
import { fromISO, horizonYears, toISO } from '../lib/dates';
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, SearchInput, SectionHeader, Select, Tabs, Textarea, Toggle } from '../components/ui';
import { useToast } from '../components/toast';
import { streamPath } from '../lib/delivery';
import { buildOrgTree, flattenOrg, orgBlockedTargets, orgStats } from '../lib/org';
import { feelingScale } from '../lib/people-workflows';

type Tab = 'tenants' | 'entities' | 'org-hierarchy' | 'departments' | 'subdepartments' | 'designations' | 'employees' | 'holidays' | 'settings' | 'audit';

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as Role[];
const COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#06b6d4', '#ec4899', '#eab308', '#6366f1', '#14b8a6', '#f97316', '#84cc16'];

export function AdminPage() {
  const {
    state,
    scope,
    tenants,
    tenant,
    calendarScope,
    calendarDepartmentIds,
    save,
    setActiveTenant,
    setCalendarScope,
    upsertTenant,
    deleteTenant,
    upsertEntity,
    deleteEntity,
    upsertDepartment,
    deleteDepartment,
    upsertStream,
    deleteStream,
    upsertDesignation,
    deleteDesignation,
    upsertEmployee,
    deleteEmployee,
    moveReportingLine,
    addHoliday,
    deleteHoliday,
    generateHolidays,
    updateSettings,
    resetDemo,
    workspace,
  } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('tenants');
  const [tenantDraft, setTenantDraft] = useState<Tenant | null>(null);
  const [scopeDraft, setScopeDraft] = useState(calendarScope);
  const [entityDraft, setEntityDraft] = useState<Entity | null>(null);
  const [deptDraft, setDeptDraft] = useState<Department | null>(null);
  const [streamDraft, setStreamDraft] = useState<DeliveryStream | null>(null);
  const [designationDraft, setDesignationDraft] = useState<Designation | null>(null);
  const [empDraft, setEmpDraft] = useState<Employee | null>(null);
  const [holidayDraft, setHolidayDraft] = useState<Holiday | null>(null);
  const [query, setQuery] = useState('');
  const [holidayCountry, setHolidayCountry] = useState('AE');
  const [holidayYear, setHolidayYear] = useState(new Date().getFullYear());
  const [settingsDraft, setSettingsDraft] = useState(state.settings);
  const [feelingDraft, setFeelingDraft] = useState(() => feelingScale(tenant));
  const [holidayView, setHolidayView] = useState<'list' | 'coverage'>('list');
  /* Drag-and-drop re-parenting for the organization hierarchy. */
  const [drag, setDrag] = useState<{ kind: 'entity' | 'department' | 'person'; id: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ kind: 'entity' | 'department'; id: string } | null>(null);

  /* The scope editor follows the active tenant; it never edits another
     tenant's configuration. */
  useEffect(() => {
    setScopeDraft(calendarScope);
  }, [calendarScope, tenant?.id]);
  useEffect(() => { setFeelingDraft(feelingScale(tenant)); }, [tenant?.id, tenant?.feelingScale]);

  const canEdit = scope.canManageMaster;
  const empMap = useMemo(() => new Map(state.employees.map((e) => [e.id, e])), [state.employees]);

  const deptMap = useMemo(() => new Map(state.departments.map((d) => [d.id, d])), [state.departments]);
  const entityMap = useMemo(() => new Map(state.entities.map((e) => [e.id, e])), [state.entities]);

  /* Organization hierarchy — companies and sub-companies nested under their
     parent entity, departments nested under their owning entity. */
  const childrenByParent = useMemo(() => {
    const map = new Map<string, Entity[]>();
    state.entities.forEach((entity) => {
      const key = entity.parentId ?? 'root';
      const list = map.get(key) ?? [];
      list.push(entity);
      map.set(key, list);
    });
    return map;
  }, [state.entities]);
  const departmentsByEntity = useMemo(() => {
    const map = new Map<string, Department[]>();
    state.departments.forEach((department) => {
      const list = map.get(department.entityId) ?? [];
      list.push(department);
      map.set(department.entityId, list);
    });
    return map;
  }, [state.departments]);

  /** True when `descendantId` sits anywhere below `ancestorId` in the tree. */
  const isEntityDescendant = useCallback(
    (descendantId: string, ancestorId: string): boolean => {
      let current = entityMap.get(descendantId);
      const seen = new Set<string>();
      while (current?.parentId) {
        if (current.parentId === ancestorId) return true;
        if (seen.has(current.parentId)) break;
        seen.add(current.parentId);
        current = entityMap.get(current.parentId);
      }
      return false;
    },
    [entityMap],
  );

  const beginDrag = useCallback((kind: 'entity' | 'department', id: string) => {
    if (!canEdit) return;
    setDrag({ kind, id });
  }, [canEdit]);

  const endDrag = useCallback(() => {
    setDrag(null);
    setDropTarget(null);
  }, []);

  const reparentEntity = useCallback(
    (entityId: string, newParentId: string | null) => {
      const entity = entityMap.get(entityId);
      if (!entity) return;
      if (newParentId !== null && isEntityDescendant(entityId, newParentId)) {
        toast.push({
          tone: 'error',
          title: 'Cannot re-parent',
          description: 'That would place a company beneath its own child and loop the hierarchy.',
        });
        return;
      }
      upsertEntity({ ...entity, parentId: newParentId });
      toast.push({ tone: 'success', title: 'Hierarchy updated', description: `${entity.name} moved.` });
    },
    [entityMap, isEntityDescendant, toast, upsertEntity],
  );

  const reparentDepartment = useCallback(
    (departmentId: string, newEntityId: string) => {
      const department = deptMap.get(departmentId);
      if (!department) return;
      upsertDepartment({ ...department, entityId: newEntityId });
      toast.push({ tone: 'success', title: 'Department moved', description: `${department.name} moved to a new entity.` });
    },
    [deptMap, toast, upsertDepartment],
  );

  /* People tree — the reporting lines confirmed for this organisation. */
  const orgTree = useMemo(() => buildOrgTree(state.employees), [state.employees]);
  const orgStatsForTenant = useMemo(() => orgStats(state.employees), [state.employees]);
  const peopleBlocked = useMemo(
    () => (drag?.kind === 'person' ? orgBlockedTargets(state.employees, drag.id) : new Set<string>()),
    [drag, state.employees],
  );

  const commitReportingMove = useCallback(
    (employeeId: string, managerId: string | null) => {
      const error = moveReportingLine(employeeId, managerId);
      if (error) {
        toast.push({ tone: 'error', title: 'Reporting line not changed', description: error });
        return;
      }
      const person = empMap.get(employeeId);
      const manager = managerId ? empMap.get(managerId) : null;
      toast.push({
        tone: 'success',
        title: manager ? `${person?.name} now reports to ${manager.name}` : `${person?.name} is now top level`,
        description: 'Saved and audited. Their team moved with them.',
      });
    },
    [moveReportingLine, toast, empMap],
  );

  function OrganizationPerson({ node }: { node: ReturnType<typeof buildOrgTree>[number] }) {
    const employee = node.employee;
    const dragging = drag?.kind === 'person' && drag.id === employee.id;
    const blocked = Boolean(drag?.kind === 'person') && peopleBlocked.has(employee.id);

    return (
      <div className="my-0.5">
        <div
          role="treeitem"
          aria-level={node.depth + 1}
          aria-label={`${employee.name}, ${employeeTitle(employee)}`}
          draggable={canEdit}
          onDragStart={(event) => {
            if (!canEdit) return;
            setDrag({ kind: 'person', id: employee.id });
            event.dataTransfer.setData('text/plain', `person:${employee.id}`);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragEnd={endDrag}
          onDragOver={(event) => {
            if (drag?.kind !== 'person' || blocked) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(event) => {
            if (drag?.kind !== 'person') return;
            event.preventDefault();
            event.stopPropagation();
            const movedId = drag.id;
            endDrag();
            if (blocked) {
              toast.push({
                tone: 'error',
                title: 'Cannot drop there',
                description: 'A person cannot report to themselves or to one of their own reports.',
              });
              return;
            }
            commitReportingMove(movedId, employee.id);
          }}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left select-none transition-colors ${
            dragging ? 'opacity-40' : ''
          } ${blocked ? 'border-dashed border-rose-200 bg-rose-50/30' : 'border-transparent hover:bg-slate-50/60'} ${
            canEdit && !blocked ? 'cursor-move' : ''
          }`}
          style={{ paddingLeft: `${(node.depth + 2) * 14 + 12}px` }}
        >
          <GripHorizontal className="h-3.5 w-3.5 flex-none text-slate-400 opacity-60" />
          <Avatar name={employee.name} color={employee.avatarColor} size={22} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-slate-800">{employee.name}</div>
            <div className="truncate text-[10px] text-slate-400">{employeeTitle(employee)}</div>
          </div>
          <Badge tone="neutral">{node.teamSize}</Badge>
        </div>
        {node.children.map((child) => (
          <OrganizationPerson key={child.employee.id} node={child} />
        ))}
      </div>
    );
  }

  const yearCoverage = useMemo(
    () =>
      horizonYears(state.settings.holidayHorizonYears).map((year) => ({
        year,
        count: state.holidays.filter((h) => h.countryCode === holidayCountry && h.type === 'public_holiday' && h.date.startsWith(String(year))).length,
      })),
    [state.holidays, state.settings.holidayHorizonYears, holidayCountry],
  );

  const holidaysForYear = useMemo(
    () =>
      state.holidays
        .filter((h) => h.countryCode === holidayCountry && h.date.startsWith(String(holidayYear)))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [state.holidays, holidayCountry, holidayYear],
  );

  const q = query.trim().toLowerCase();
  const employees = state.employees
    .filter((e) => (q ? `${e.name} ${e.email} ${e.code}`.toLowerCase().includes(q) : true))
    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.name.localeCompare(b.name));

  /* Drag-and-drop tree nodes for the Organization hierarchy tab. They close over
     AdminPage's drag state, the entity/department maps and the save functions. */
  function OrganizationEntity({ entity, depth }: { entity: Entity; depth: number }) {
    const children = childrenByParent.get(entity.id) ?? [];
    const depts = departmentsByEntity.get(entity.id) ?? [];
    const dragging = drag?.kind === 'entity' && drag.id === entity.id;
    const isTarget = dropTarget?.kind === 'entity' && dropTarget.id === entity.id;
    const validTarget = Boolean(
      drag?.kind === 'entity'
        ? drag.id !== entity.id && !isEntityDescendant(entity.id, drag.id)
        : drag?.kind === 'department',
    );
    const highlight = dragging || (isTarget && validTarget);

    return (
      <div key={entity.id} className="my-0.5">
        <div
          role="treeitem"
          aria-level={depth + 1}
          draggable={canEdit}
          onDragStart={(e) => {
            beginDrag('entity', entity.id);
            e.dataTransfer.setData('text/plain', `entity:${entity.id}`);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (validTarget) setDropTarget({ kind: 'entity', id: entity.id });
          }}
          onDragLeave={() => {
            if (dropTarget?.kind === 'entity' && dropTarget.id === entity.id) setDropTarget(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            endDrag();
            if (drag?.kind === 'entity') reparentEntity(drag.id, entity.id);
            else if (drag?.kind === 'department') reparentDepartment(drag.id, entity.id);
          }}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left cursor-move select-none transition-colors ${
            highlight ? 'border-brand-300 bg-brand-50/60' : 'border-transparent hover:bg-slate-50/60'
          }`}
          style={{ paddingLeft: `${Math.max(0, depth - 1) * 14 + 12}px` }}
        >
          <div className="flex items-center gap-1.5 text-slate-400">
            <GripHorizontal className="h-3.5 w-3.5 opacity-60" />
            {depth > 0 ? <div className="w-[10px]" /> : null}
          </div>
          <span className={`flex h-6 w-6 items-center justify-center rounded-md ${entity.type === 'group' ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'}`}>
            {entity.type === 'group' ? <Building2 className="h-3 w-3" /> : <Landmark className="h-3 w-3" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-800 truncate">{entity.name}</div>
            <div className="text-[10px] text-slate-400 truncate">
              {entity.code} · {entity.type.replace('_', ' ')}
            </div>
          </div>
          <Badge tone="neutral">{depts.length} department{depts.length === 1 ? '' : 's'}</Badge>
          {depth === 0 && <span className="ml-auto text-[10px] text-slate-400">Top level</span>}
        </div>
        {children.map((child) => (
          <OrganizationEntity key={child.id} entity={child} depth={depth + 1} />
        ))}
        {depts.map((department) => (
          <OrganizationDepartment key={department.id} department={department} depth={depth + 1} />
        ))}
      </div>
    );
  }

  function OrganizationDepartment({ department, depth }: { department: Department; depth: number }) {
    const dragging = drag?.kind === 'department' && drag.id === department.id;
    const validTarget = drag?.kind === 'department';
    const isTarget = dropTarget?.kind === 'entity';
    const highlight = dragging || (isTarget && validTarget);

    return (
      <div key={department.id} className="my-0.5">
        <div
          role="treeitem"
          aria-level={depth + 1}
          draggable={canEdit}
          onDragStart={(e) => {
            beginDrag('department', department.id);
            e.dataTransfer.setData('text/plain', `department:${department.id}`);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (validTarget) setDropTarget({ kind: 'entity', id: department.entityId });
          }}
          onDragLeave={endDrag}
          onDrop={(e) => {
            e.preventDefault();
            endDrag();
            // Departments are leaves: dropping onto one does nothing.
          }}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left cursor-move select-none transition-colors ${
            highlight ? 'border-brand-300 bg-brand-50/60' : 'border-transparent hover:bg-slate-50/60'
          }`}
          style={{ paddingLeft: `${depth * 14 + 12}px` }}
        >
          <div className="flex items-center gap-1.5 text-slate-400">
            <GripHorizontal className="h-3.5 w-3.5 opacity-60" />
          </div>
          <span className="h-3 w-3 rounded-full" style={{ background: department.color }} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-700 truncate">{department.name}</div>
            <div className="text-[10px] text-slate-400 truncate">{department.code}</div>
          </div>
          <Badge tone="neutral">{state.employees.filter((e) => e.departmentId === department.id).length} people</Badge>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Configuration"
        title="Master data setup"
        description="Group → entities → departments → people, plus country calendars. Everything else in the portal is derived from these records, so this is the only place that needs to be right."
        actions={
          <>
            <Button
              size="sm"
              onClick={() => {
                const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `orbit-backup-${toISO(new Date())}.json`;
                a.click();
                URL.revokeObjectURL(url);
                toast.push({ tone: 'success', title: 'Backup exported', description: 'Full workspace JSON. Keep this backup private; see docs/DEPLOYMENT.md for restore instructions.' });
              }}
            >
              <Download className="h-3.5 w-3.5" /> Export backup
            </Button>
          </>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { icon: <Landmark className="h-4 w-4" />, label: 'Entities', value: state.entities.length, hint: `${state.entities.filter((e) => e.type === 'company').length} companies · ${state.entities.filter((e) => e.type === 'sub_company').length} sub-companies` },
          { icon: <Layers className="h-4 w-4" />, label: 'Departments', value: state.departments.length, hint: `${state.departments.filter((d) => !d.headId).length} without a head` },
          { icon: <Users className="h-4 w-4" />, label: 'People', value: state.employees.length, hint: `${state.employees.filter((e) => e.status === 'active').length} active · ${state.employees.filter((e) => e.status === 'on_leave').length} on leave` },
          { icon: <Globe2 className="h-4 w-4" />, label: 'Holiday records', value: state.holidays.filter((h) => h.type === 'public_holiday').length, hint: `${state.countries.length} countries · ${state.settings.holidayHorizonYears}-year horizon` },
        ].map((s) => (
          <Card key={s.label} className="!py-3">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="rounded-md bg-slate-100 p-1.5">{s.icon}</span>
              <span className="text-[10px] font-medium uppercase tracking-wider">{s.label}</span>
            </div>
            <div className="mt-1.5 text-xl font-semibold tabular-nums text-slate-900">{s.value}</div>
            <div className="text-[10px] text-slate-400">{s.hint}</div>
          </Card>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs<Tab>
          tabs={[
            { id: 'tenants', label: 'Tenants & calendar scope' },
            { id: 'entities', label: 'Entities & group' },
            { id: 'org-hierarchy', label: 'Organization hierarchy' },
            { id: 'departments', label: 'Departments' },
            { id: 'subdepartments', label: 'Sub-departments', count: state.deliveryStreams.length },
            { id: 'designations', label: 'Designations', count: state.designations.length },
            { id: 'employees', label: 'Employees' },
            { id: 'holidays', label: 'Holidays & weekends' },
            { id: 'settings', label: 'Group settings' },
            { id: 'audit', label: 'Audit trail' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {!canEdit ? (
          <Badge tone="warn">
            <Shield className="h-3 w-3" /> read-only for your role
          </Badge>
        ) : null}
      </div>

      {tab === 'tenants' ? (
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="space-y-3 xl:col-span-2">
            <Card padded={false}>
              <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-4">
                <SectionHeader
                  title="Tenants"
                  subtitle="A tenant is a hard boundary: its entities, sub-entities, departments, people, activities, PTO and audit trail are never visible to another tenant"
                  action={
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!canEdit}
                      onClick={() =>
                        setTenantDraft({
                          id: newId('tnt'),
                          name: '',
                          code: '',
                          countryCode: state.countries[0]?.code ?? 'AU',
                          timezone: state.countries[0]?.timezone ?? 'Australia/Sydney',
                          currency: 'AUD',
                          industry: '',
                          status: 'active',
                          calendarScope: { mode: 'single', departmentIds: [] },
                          ptoAnnualEntitlementDays: 20,
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" /> Add tenant
                    </Button>
                  }
                />
              </div>
              <div className="mt-3 grid gap-2 px-4 pb-4 sm:grid-cols-2">
                {tenants.map((row) => {
                  const stats = tenantStats(state, row.id);
                  const active = row.id === tenant?.id;
                  return (
                    <div
                      key={row.id}
                      className={`rounded-xl border p-3 ${active ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-900">{row.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {row.code} · {row.currency} · {row.countryCode}
                          </div>
                        </div>
                        {active ? <Badge tone="brand">active</Badge> : <Badge tone="neutral">{row.status}</Badge>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-slate-500">
                        <Badge tone="neutral">{stats.entities} entities</Badge>
                        <Badge tone="neutral">{stats.departments} departments</Badge>
                        <Badge tone="neutral">{stats.people} people</Badge>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-600">
                        <span className="font-medium text-slate-700">Calendar:</span> {CALENDAR_SCOPE_LABELS[row.calendarScope.mode]} ·{' '}
                        {describeCalendarScope(row, state.departments)}
                      </div>
                      <div className="text-[10px] text-slate-500">PTO entitlement {row.ptoAnnualEntitlementDays} working days / year</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button size="sm" disabled={active} onClick={() => setActiveTenant(row.id)}>
                          {active ? 'Active' : 'Switch to tenant'}
                        </Button>
                        <Button size="sm" disabled={!canEdit} onClick={() => setTenantDraft(row)}>
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={!canEdit || tenants.length <= 1}
                          title={tenants.length <= 1 ? 'A workspace always keeps one tenant' : 'Remove this tenant and everything it owns'}
                          onClick={() => {
                            if (confirm(`Delete ${row.name} and every entity, department, person, activity and leave record it owns?`)) {
                              deleteTenant(row.id);
                              toast.push({ tone: 'success', title: 'Tenant removed', description: 'Other tenants were left unchanged.' });
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <SectionHeader
                title="Department calendar scope"
                subtitle={`Master setting for ${tenant?.name ?? 'this tenant'} — is the calendar implemented for one department, several departments, or all of them?`}
                action={<Badge tone="brand">{CALENDAR_SCOPE_LABELS[scopeDraft.mode]}</Badge>}
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {(['single', 'multiple', 'all'] as CalendarScopeMode[]).map((mode) => (
                  <button
                    key={mode}
                    disabled={!canEdit}
                    onClick={() =>
                      setScopeDraft((prev) => {
                        const departments = state.departments;
                        const fallback = prev.departmentIds.length ? prev.departmentIds : departments.slice(0, 1).map((d) => d.id);
                        return normaliseCalendarScope(
                          { mode, departmentIds: mode === 'all' ? [] : fallback },
                          departments.map((d) => d.id),
                        );
                      })
                    }
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      scopeDraft.mode === mode
                        ? 'border-brand-400 bg-brand-50/60 ring-1 ring-brand-200'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <div className="text-xs font-semibold text-slate-800">{CALENDAR_SCOPE_LABELS[mode]}</div>
                    <div className="mt-0.5 text-[10px] leading-snug text-slate-500">{CALENDAR_SCOPE_HINTS[mode]}</div>
                  </button>
                ))}
              </div>

              {scopeDraft.mode !== 'all' ? (
                <div className="mt-3 rounded-lg border border-slate-200 p-3">
                  <div className="mb-1.5 text-[11px] font-semibold text-slate-700">
                    Departments in scope {scopeDraft.mode === 'single' ? '(choose one)' : '(choose one or more)'}
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {state.departments.map((department) => {
                      const checked = scopeDraft.departmentIds.includes(department.id);
                      const entity = state.entities.find((row) => row.id === department.entityId);
                      return (
                        <label
                          key={department.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-[11px] ${
                            checked ? 'border-brand-300 bg-brand-50/50' : 'border-slate-200'
                          }`}
                        >
                          <input
                            type={scopeDraft.mode === 'single' ? 'radio' : 'checkbox'}
                            checked={checked}
                            disabled={!canEdit}
                            onChange={(e) => {
                              setScopeDraft((prev) => {
                                const allowed = state.departments.map((d) => d.id);
                                const next = prev.departmentIds.filter((id) => id !== department.id);
                                const departmentIds = e.target.checked
                                  ? prev.mode === 'single'
                                    ? [department.id]
                                    : [...next, department.id]
                                  : prev.mode === 'single'
                                    ? [department.id]
                                    : next;
                                return normaliseCalendarScope({ mode: prev.mode, departmentIds }, allowed);
                              });
                            }}
                            className="h-3.5 w-3.5 accent-brand-600"
                          />
                          <span className="h-2 w-2 rounded-full" style={{ background: department.color }} />
                          <span className="min-w-0 flex-1 truncate text-slate-700">{department.name}</span>
                          <span className="text-[9px] text-slate-400">{entity?.code}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 rounded-lg bg-slate-50/70 p-2.5 text-[11px] text-slate-600">
                <div className="font-medium text-slate-700">What this controls</div>
                Every operational screen in this tenant — command centre, calendar, activity register, roadmap, timesheets, stand-ups, projects,
                capitalisation, PTO and performance — reads only these departments. A person’s own department is always kept so nobody is locked
                out of their own calendar.
                <div className="mt-1.5 text-[10px] text-slate-500">
                  Live scope: {calendarDepartmentIds.length} department(s) ·{' '}
                  {state.employees.filter((employee) => calendarDepartmentIds.includes(employee.departmentId)).length} people
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  disabled={!canEdit}
                  onClick={() => {
                    setCalendarScope(scopeDraft);
                    toast.push({
                      tone: 'success',
                      title: 'Calendar scope saved',
                      description: `${CALENDAR_SCOPE_LABELS[scopeDraft.mode]} — every screen now reads only those departments.`,
                    });
                  }}
                >
                  <Save className="h-3.5 w-3.5" /> Save calendar scope
                </Button>
                <Button onClick={() => setScopeDraft(calendarScope)}>Reset</Button>
              </div>
            </Card>
          </div>

          <div className="space-y-3">
            <Card>
              <SectionHeader title="Isolation rules" subtitle="How a tenant is kept separate" />
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-600">
                <li>Entities and sub-entities carry a tenant id; departments inherit it, people inherit their department’s.</li>
                <li>Activities, timesheets, stand-ups, projects, capitalisation packs, connector health, PTO and escalations are filtered by that ownership on read and again on write.</li>
                <li>Profile selection is limited to the active tenant, so another tenant’s people can never be impersonated.</li>
                <li>Public holidays and country rules are reference data shared by the workspace; each person still uses their own country.</li>
                <li>Deleting a tenant removes exactly its rows — every other tenant is left untouched.</li>
              </ul>
            </Card>
            <Card>
              <SectionHeader title="Active tenant" subtitle="What the portal is showing right now" />
              <div className="mt-2 space-y-1.5 text-[11px] text-slate-600">
                <Row label="Tenant" value={tenant?.name ?? '—'} />
                <Row label="Code" value={tenant?.code ?? '—'} />
                <Row label="Currency" value={tenant?.currency ?? '—'} />
                <Row label="Calendar scope" value={CALENDAR_SCOPE_LABELS[calendarScope.mode]} />
                <Row label="Departments in scope" value={calendarDepartmentIds.length} />
                <Row label="PTO entitlement" value={`${tenant?.ptoAnnualEntitlementDays ?? 20} days`} />
                <Row label="Entities in tenant" value={tenantStats(state, tenant?.id ?? '').entities} />
                <Row label="People in tenant" value={tenantStats(state, tenant?.id ?? '').people} />
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'entities' ? (
        <Card padded={false}>
          <div className="px-4 pt-4">
            <SectionHeader
              title="Legal entity hierarchy"
              subtitle="A group can hold any number of companies and sub-companies; each carries its own country and timezone for calendar rules"
              action={
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!canEdit}
                  onClick={() =>
                    setEntityDraft({
                      id: newId('ent'),
                      tenantId: tenant?.id ?? '',
                      name: '',
                      code: '',
                      type: 'company',
                      parentId: state.entities[0]?.id ?? null,
                      countryCode: tenant?.countryCode ?? 'AE',
                      timezone: tenant?.timezone ?? 'Asia/Dubai',
                      industry: '',
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add entity
                </Button>
              }
            />
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  {['Entity', 'Type', 'Parent', 'Country', 'Timezone', 'Departments', 'People', ''].map((h) => (
                    <th key={h} className="border-b border-slate-200 bg-slate-50/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.entities.map((ent) => (
                  <tr key={ent.id} className="group hover:bg-slate-50/70">
                    <td className="border-b border-slate-100 py-2.5 pl-4 pr-3">
                      <div className="flex items-center gap-2">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${ent.type === 'group' ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'}`}>
                          {ent.type === 'group' ? <Building2 className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                        </span>
                        <div>
                          <div className="text-xs font-semibold text-slate-800">{ent.name}</div>
                          <div className="text-[10px] text-slate-400">{ent.code}{ent.industry ? ` · ${ent.industry}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      <Badge tone={ent.type === 'group' ? 'brand' : ent.type === 'company' ? 'info' : 'neutral'}>
                        {ent.type.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-[11px] text-slate-500">
                      {ent.parentId ? entityMap.get(ent.parentId)?.name ?? '—' : '—'}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-[11px] text-slate-600">
                      {state.countries.find((c) => c.code === ent.countryCode)?.flag} {ent.countryCode}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-[10px] text-slate-500">{ent.timezone}</td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-[11px] tabular-nums text-slate-600">
                      {state.departments.filter((d) => d.entityId === ent.id).length}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-[11px] tabular-nums text-slate-600">
                      {state.employees.filter((e) => e.entityId === ent.id).length}
                    </td>
                    <td className="border-b border-slate-100 py-2.5 pl-2 pr-4 text-right">
                      <div className="flex justify-end gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <button disabled={!canEdit} onClick={() => setEntityDraft(ent)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          disabled={!canEdit || ent.type === 'group'}
                          onClick={() => {
                            if (confirm(`Delete ${ent.name}? Departments and people under it will be removed.`)) { const error = deleteEntity(ent.id); if (error) toast.push({ tone: 'error', title: 'Entity not removed', description: error }); }
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === 'org-hierarchy' ? (
        <div className="grid gap-3 xl:grid-cols-[260px_1fr]">
          <div className="space-y-3">
            <Card>
              <SectionHeader
                title="Organization hierarchy"
                subtitle="Drag a company, sub-company or department onto a new parent — or to the top level — to re-parent it. Groups always sit at the top of the tree. Moves are saved and audited immediately."
                action={
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!canEdit}
                    onClick={() =>
                      setEntityDraft({
                        id: newId('ent'),
                        tenantId: tenant?.id ?? '',
                        name: '',
                        code: '',
                        type: 'company',
                        parentId: null,
                        countryCode: tenant?.countryCode ?? 'AE',
                        timezone: tenant?.timezone ?? 'Asia/Dubai',
                        industry: '',
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Add entity
                  </Button>
                }
              />
              {canEdit ? (
                <div
                  className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/50 p-4 text-center"
                  onDragOver={(e) => e.preventDefault()}
                  onDragLeave={endDrag}
                  onDrop={(e) => {
                    e.preventDefault();
                    endDrag();
                    if (drag?.kind === 'entity') reparentEntity(drag.id, null);
                  }}
                >
                  <GripHorizontal className="mb-1.5 h-4 w-4 text-slate-400" />
                  <div className="text-xs font-semibold text-slate-700">Top level</div>
                  <div className="text-[10px] text-slate-500">
                    Drag a company or sub-company here to make it a top-level group of companies
                  </div>
                </div>
              ) : null}
              {!canEdit ? (
                <Card className="border-slate-200/60">
                  <SectionHeader
                    title="Read-only view"
                    subtitle="Your role cannot manage master data. Sign in as a CEO, Head of Operations or department head to re-parent entities and departments here."
                  />
                </Card>
              ) : null}
            </Card>
          </div>
          <Card padded={false}>
            <div className="overflow-x-auto">
              <div role="tree" className="min-w-[560px] divide-y divide-slate-100/60">
                {(childrenByParent.get('root') ?? []).map((entity) => (
                  <OrganizationEntity key={entity.id} entity={entity} depth={0} />
                ))}
              </div>
            </div>
          </Card>

          {/* Reporting lines: the people branch of the same organisation tree.
              Drag a person onto a colleague to make them the manager. */}
          <Card padded={false} className="xl:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
              <SectionHeader
                title="Reporting lines · people"
                subtitle="Drag a person onto the colleague who should become their manager — their team moves with them. Use the full Organisation screen for a searchable chart, directory and change history."
                action={
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{orgStatsForTenant.headcount} people</Badge>
                    <Badge tone="neutral">{orgStatsForTenant.layers} layers</Badge>
                    <a href="#/organisation">
                      <Button size="sm">
                        <Network className="h-3.5 w-3.5" /> Open Organisation
                      </Button>
                    </a>
                  </div>
                }
              />
            </div>
            <div
              className={`mx-4 mt-3 rounded-xl border border-dashed px-3 py-2 text-center transition-colors ${
                drag?.kind === 'person' ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 bg-slate-50/60'
              }`}
              onDragOver={(event) => {
                if (drag?.kind !== 'person') return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (drag?.kind !== 'person') return;
                event.preventDefault();
                const movedId = drag.id;
                endDrag();
                commitReportingMove(movedId, null);
              }}
            >
              <div className="text-[11px] font-semibold text-slate-700">Top of the hierarchy</div>
              <div className="text-[10px] text-slate-500">
                {canEdit ? 'Drop a person here to remove their manager' : 'Read-only for your role'}
              </div>
            </div>
            <div className="mt-3 overflow-x-auto pb-3">
              <div role="tree" aria-label="Reporting lines" className="min-w-[560px] divide-y divide-slate-100/60">
                {orgTree.map((node) => (
                  <OrganizationPerson key={node.employee.id} node={node} />
                ))}
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'departments' ? (
        <Card padded={false}>
          <div className="px-4 pt-4">
            <SectionHeader
              title="Departments with accountable heads"
              subtitle="A department head owns the calendar and the score; the Head of Operations is the default escalation copy"
              action={
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!canEdit}
                  onClick={() =>
                    setDeptDraft({
                      id: newId('dept'),
                      entityId: state.entities[1]?.id ?? state.entities[0].id,
                      name: '',
                      code: '',
                      headId: null,
                      opsOwnerId: state.employees.find((e) => e.role === 'head_operations')?.id ?? null,
                      costCenter: '',
                      color: COLORS[state.departments.length % COLORS.length],
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add department
                </Button>
              }
            />
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  {['Department', 'Entity', 'Head', 'Ops owner', 'Cost centre', 'People', 'Activities', ''].map((h) => (
                    <th key={h} className="border-b border-slate-200 bg-slate-50/90 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.departments.map((d) => (
                  <tr key={d.id} className="group hover:bg-slate-50/70">
                    <td className="border-b border-slate-100 py-2.5 pl-4 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-1.5 rounded-full" style={{ background: d.color }} />
                        <div>
                          <div className="text-xs font-semibold text-slate-800">{d.name}</div>
                          <div className="text-[10px] text-slate-400">{d.code}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-[11px] text-slate-600">{entityMap.get(d.entityId)?.name}</td>
                    <td className="border-b border-slate-100 px-3 py-2.5">
                      {d.headId ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar name={empMap.get(d.headId)?.name ?? ''} color={empMap.get(d.headId)?.avatarColor} size={22} />
                          <div>
                            <div className="text-[11px] font-medium text-slate-700">{empMap.get(d.headId)?.name}</div>
                            <div className="text-[9px] capitalize text-slate-400">{employeeTitle(empMap.get(d.headId))}</div>
                          </div>
                        </div>
                      ) : (
                        <Badge tone="danger">unassigned</Badge>
                      )}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-[11px] text-slate-600">{empMap.get(d.opsOwnerId ?? '')?.name ?? '—'}</td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-[10px] text-slate-500">{d.costCenter}</td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-[11px] tabular-nums text-slate-600">{state.employees.filter((e) => e.departmentId === d.id).length}</td>
                    <td className="border-b border-slate-100 px-3 py-2.5 text-[11px] tabular-nums text-slate-600">{state.activities.filter((a) => a.departmentId === d.id).length}</td>
                    <td className="border-b border-slate-100 py-2.5 pl-2 pr-4 text-right">
                      <div className="flex justify-end gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <button disabled={!canEdit} onClick={() => setDeptDraft(d)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          disabled={!canEdit}
                          onClick={() => {
                            if (confirm(`Delete ${d.name} and all of its activities?`)) { const error = deleteDepartment(d.id); if (error) toast.push({ tone: 'error', title: 'Department not removed', description: error }); }
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === 'subdepartments' ? (
        <Card>
          <SectionHeader
            title="Sub-departments & delivery streams"
            subtitle="Editable nested teams for every department — not only DevOps. Assign each team’s lead, parent, code and calendar colour, then link employees in the employee master."
            action={
              <Button
                size="sm"
                variant="primary"
                disabled={!canEdit || !state.departments.length}
                onClick={() => setStreamDraft({
                  id: newId('stream'), departmentId: state.departments[0]?.id ?? '', parentId: null,
                  name: '', code: '', leadId: null, color: COLORS[state.deliveryStreams.length % COLORS.length],
                })}
              >
                <Plus className="h-3.5 w-3.5" /> Add sub-department
              </Button>
            }
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {[...state.deliveryStreams]
              .sort((a, b) => (deptMap.get(a.departmentId)?.name ?? '').localeCompare(deptMap.get(b.departmentId)?.name ?? '') || streamPath(state.deliveryStreams, a.id).map((row) => row.name).join('/').localeCompare(streamPath(state.deliveryStreams, b.id).map((row) => row.name).join('/')))
              .map((stream) => {
                const lead = empMap.get(stream.leadId ?? '');
                const members = state.employees.filter((employee) => employee.streamId === stream.id || employee.supportingStreamIds?.includes(stream.id));
                const children = state.deliveryStreams.filter((row) => row.parentId === stream.id);
                return (
                  <div key={stream.id} className="rounded-xl border border-slate-200 p-3" style={{ borderLeft: `4px solid ${stream.color}` }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] text-slate-400">{deptMap.get(stream.departmentId)?.name} · {streamPath(state.deliveryStreams, stream.id).slice(0, -1).map((row) => row.name).join(' / ') || 'Top level'}</div>
                        <h3 className="truncate text-sm font-semibold text-slate-800">{stream.name}</h3>
                        <div className="font-mono text-[10px] text-slate-400">{stream.code}</div>
                      </div>
                      <div className="flex flex-none gap-1">
                        <button disabled={!canEdit} aria-label={`Edit ${stream.name}`} onClick={() => setStreamDraft(stream)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><Pencil className="h-3.5 w-3.5" /></button>
                        <button
                          disabled={!canEdit}
                          aria-label={`Delete ${stream.name}`}
                          onClick={() => {
                            const result = deleteStream(stream.id);
                            toast.push(result
                              ? { tone: 'error', title: 'Sub-department is still in use', description: result }
                              : { tone: 'success', title: 'Sub-department deleted' });
                          }}
                          className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                        ><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {lead ? <Avatar name={lead.name} color={lead.avatarColor} size={26} /> : <Users className="h-5 w-5 text-slate-300" />}
                      <div><div className="text-[11px] font-medium text-slate-700">{lead?.name ?? 'No lead assigned'}</div><div className="text-[9px] text-slate-400">{lead ? employeeTitle(lead) : 'Select a lead when editing'}</div></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5"><Badge tone="neutral">{members.length} members</Badge><Badge tone="neutral">{children.length} child teams</Badge></div>
                  </div>
                );
              })}
          </div>
          {!state.deliveryStreams.length ? <div className="mt-4"><EmptyState title="No sub-departments configured" description="Add nested teams such as PMO, Data, QA or Store Operations. They can be modified at any time." /></div> : null}
        </Card>
      ) : null}

      {tab === 'designations' ? (
        <Card>
          <SectionHeader
            title="Designation master"
            subtitle="Reusable business titles stay separate from access roles. Editing a linked designation updates every employee who uses it; employees can also retain a custom title."
            action={
              <Button size="sm" variant="primary" disabled={!canEdit} onClick={() => setDesignationDraft({ id: newId('des'), tenantId: tenant?.id ?? '', title: '', code: '', description: '' })}>
                <Plus className="h-3.5 w-3.5" /> Add designation
              </Button>
            }
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[...state.designations].sort((a, b) => a.title.localeCompare(b.title)).map((designation) => {
              const assigned = state.employees.filter((employee) => employee.designationId === designation.id);
              return (
                <div key={designation.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><h3 className="truncate text-xs font-semibold text-slate-800">{designation.title}</h3><div className="mt-0.5 font-mono text-[10px] text-slate-400">{designation.code || 'NO CODE'}</div></div>
                    <div className="flex flex-none gap-1">
                      <button disabled={!canEdit} aria-label={`Edit ${designation.title}`} onClick={() => setDesignationDraft(designation)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><Pencil className="h-3.5 w-3.5" /></button>
                      <button
                        disabled={!canEdit}
                        aria-label={`Delete ${designation.title}`}
                        onClick={() => {
                          const result = deleteDesignation(designation.id);
                          toast.push(result
                            ? { tone: 'error', title: 'Designation is still assigned', description: result }
                            : { tone: 'success', title: 'Designation deleted' });
                        }}
                        className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      ><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <p className="mt-2 min-h-8 text-[10px] leading-relaxed text-slate-500">{designation.description || 'No description recorded.'}</p>
                  <Badge tone={assigned.length ? 'info' : 'neutral'}>{assigned.length} employee{assigned.length === 1 ? '' : 's'} linked</Badge>
                </div>
              );
            })}
          </div>
          {!state.designations.length ? <div className="mt-4"><EmptyState title="No designations yet" description="Add a reusable title, or edit an employee with a custom designation to link it into the master." /></div> : null}
        </Card>
      ) : null}

      {tab === 'employees' ? (
        <Card padded={false}>
          <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-4">
            <SectionHeader
              title="Employee & management master"
              subtitle="Roles define visibility: CEO sees the group, Head of Operations sees operational departments, heads see their own unit, supervisors see their reporting line"
            />
            <div className="flex gap-2">
              <SearchInput value={query} onChange={setQuery} placeholder="Search people" className="w-[200px]" />
              <Button
                size="sm"
                variant="primary"
                disabled={!canEdit}
                onClick={() =>
                  setEmpDraft({
                    id: newId('emp'),
                    name: '',
                    email: '',
                    code: `${tenant?.code ?? 'EMP'}-${Math.floor(1000 + Math.random() * 8999)}`,
                    entityId: state.departments[0]?.entityId ?? state.entities[0].id,
                    departmentId: state.departments[0]?.id ?? '',
                    role: 'employee',
                    jobTitle: '',
                    managerId: scope.user.id,
                    countryCode: tenant?.countryCode ?? 'AU',
                    weeklyHours: scope.user.weeklyHours,
                    joinDate: toISO(new Date()),
                    status: 'active',
                    avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)],
                    employmentType: 'employee',

                  })
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add employee
              </Button>
            </div>
          </div>
          <div className="mt-3 max-h-[62vh] overflow-auto">
            <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  {['Employee', 'Designation / access tier', 'Department', 'Entity', 'Reports to', 'Country', 'Weekly hrs', 'Status', ''].map((h) => (
                    <th key={h} className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4 backdrop-blur">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id} className="group hover:bg-slate-50/70">
                    <td className="border-b border-slate-100 py-2 pl-4 pr-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={e.name} color={e.avatarColor} size={26} />
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-semibold text-slate-800">{e.name}</div>
                          <div className="truncate text-[9px] text-slate-400">{e.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <div className="text-[11px] font-medium text-slate-700">{employeeTitle(e)}</div>
                      <Badge tone={e.role === 'ceo' ? 'purple' : e.role === 'head_operations' ? 'brand' : e.role === 'department_head' ? 'info' : 'neutral'}>
                        {ROLE_LABELS[e.role]} access
                      </Badge>
                      {e.employmentType === 'contractor' || e.workLocation === 'remote' ? (
                        <div className="mt-0.5 text-[9px] text-slate-400">
                          {e.workLocation === 'remote' ? 'Remote' : ''}{e.workLocation === 'remote' && e.employmentType === 'contractor' ? ' · ' : ''}{e.employmentType === 'contractor' ? 'Contractor' : ''}
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-600">{deptMap.get(e.departmentId)?.name}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-[10px] text-slate-500">{entityMap.get(e.entityId)?.code}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-600">{empMap.get(e.managerId ?? '')?.name ?? '—'}</td>
                    <td className="border-b border-slate-100 px-3 py-2 text-[10px] text-slate-600">
                      {state.countries.find((c) => c.code === e.countryCode)?.flag} {e.countryCode}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-[11px] tabular-nums text-slate-600">{e.weeklyHours}h</td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <Badge tone={e.status === 'active' ? 'good' : e.status === 'on_leave' ? 'warn' : 'neutral'}>{e.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="border-b border-slate-100 py-2 pl-2 pr-4 text-right">
                      <div className="flex justify-end gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                        <button disabled={!canEdit} onClick={() => setEmpDraft(e)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          disabled={!canEdit || e.id === scope.user.id}
                          onClick={() => {
                            if (confirm(`Remove ${e.name} from the master?`)) { const error = deleteEmployee(e.id); if (error) toast.push({ tone: 'error', title: 'Employee not removed', description: error }); }
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {tab === 'holidays' ? (
        <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
          <Card padded={false}>
            <div className="flex flex-wrap items-end justify-between gap-2 px-4 pt-4">
              <SectionHeader
                title="Country holiday calendar"
                subtitle="Public holidays and country weekends drive capacity, utilization and roadmap shading. Ramadan / Eid dates are tentative by nature — treat them as planning dates."
              />
              <div className="flex flex-wrap gap-2">
                <div className="w-[170px]">
                  <Select value={holidayCountry} onChange={(e) => setHolidayCountry(e.target.value)}>
                    {state.countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-[100px]">
                  <Select value={holidayYear} onChange={(e) => setHolidayYear(Number(e.target.value))}>
                    {horizonYears(state.settings.holidayHorizonYears + 1).map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!canEdit}
                  onClick={() => {
                    const count = generateHolidays(holidayCountry, holidayYear);
                    toast.push({
                      tone: count ? 'success' : 'info',
                      title: count ? `${count} holidays added` : 'Calendar already complete',
                      description: count ? `${holidayCountry} · ${holidayYear}` : `No missing public holidays for ${holidayCountry} in ${holidayYear}.`,
                    });
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Generate {holidayYear}
                </Button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 px-4">
              <Tabs
                tabs={[
                  { id: 'list', label: 'Holiday list', count: holidaysForYear.length },
                  { id: 'coverage', label: `${state.settings.holidayHorizonYears}-year coverage` },
                ]}
                value={holidayView}
                onChange={(v) => setHolidayView(v as typeof holidayView)}
              />
              <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => setHolidayDraft({ id: newId('hol'), countryCode: holidayCountry, date: toISO(new Date()), name: '', type: 'public_holiday' })}>
                <Plus className="h-3.5 w-3.5" /> Add manually
              </Button>
            </div>
            {holidayView === 'list' ? (
              <div className="mt-2 max-h-[52vh] overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-left">
                  <thead>
                    <tr>
                      {['Date', 'Day', 'Holiday', 'Type', ''].map((h) => (
                        <th key={h} className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 first:pl-4 last:pr-4">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {holidaysForYear.map((h) => (
                      <tr key={h.id} className="group hover:bg-slate-50/70">
                        <td className="border-b border-slate-100 py-2 pl-4 pr-3 text-[11px] tabular-nums text-slate-700">{h.date}</td>
                        <td className="border-b border-slate-100 px-3 py-2 text-[10px] text-slate-500">{fromISO(h.date).toLocaleDateString('en-GB', { weekday: 'short' })}</td>
                        <td className="border-b border-slate-100 px-3 py-2 text-[11px] text-slate-700">{h.name}</td>
                        <td className="border-b border-slate-100 px-3 py-2">
                          <Badge tone={h.type === 'public_holiday' ? 'danger' : h.type === 'company_holiday' ? 'warn' : 'neutral'}>{h.type.replace('_', ' ')}</Badge>
                        </td>
                        <td className="border-b border-slate-100 py-2 pl-2 pr-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button disabled={!canEdit} aria-label={`Edit ${h.name}`} onClick={() => setHolidayDraft(h)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><Pencil className="h-3.5 w-3.5" /></button>
                            <button
                              disabled={!canEdit}
                              aria-label={`Delete ${h.name}`}
                              onClick={() => deleteHoliday(h.id)}
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {holidaysForYear.length === 0 ? (
                  <div className="p-4">
                    <EmptyState
                      icon={<CalendarDays className="h-5 w-5" />}
                      title="No holidays recorded for this year"
                      description="Generate the statutory calendar for this country, then adjust one-off company holidays."
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="p-4">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {yearCoverage.map((y) => (
                    <div key={y.year} className={`rounded-lg border p-2.5 ${y.count ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">{y.year}</span>
                        {y.count ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-500">{y.count} public holidays recorded</div>
                      {!y.count ? (
                        <button
                          disabled={!canEdit}
                          onClick={() => generateHolidays(holidayCountry, y.year)}
                          className="mt-1 text-[10px] font-semibold text-brand-600 hover:text-brand-700"
                        >
                          Generate now
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <p className="mt-3 rounded-lg bg-slate-50 p-2.5 text-[10px] leading-relaxed text-slate-500">
                  The horizon is set to {state.settings.holidayHorizonYears} years in Group settings. Islamic calendar dates shift roughly 11 days
                  earlier each Gregorian year; the seeded data uses published projections and flags them as tentative in the UI tooltip.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader title="Weekly off by country" subtitle="Drives weekend shading and working-day capacity" />
            <div className="mt-2 space-y-1.5">
              {state.countries.map((c) => (
                <div key={c.code} className="rounded-lg border border-slate-100 px-2.5 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-slate-800">
                      {c.flag} {c.name}
                    </span>
                    <span className="text-[9px] text-slate-400">{c.timezone}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                      <button
                        key={d}
                        disabled={!canEdit}
                        onClick={() =>
                          save((prev) => ({
                            ...prev,
                            countries: prev.countries.map((x) =>
                              x.code === c.code
                                ? { ...x, weeklyOff: x.weeklyOff.includes(i) ? x.weeklyOff.filter((n) => n !== i) : [...x.weeklyOff, i].sort() }
                                : x,
                            ),
                          }))
                        }
                        className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                          c.weeklyOff.includes(i) ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'settings' ? (
        <div className="grid gap-3 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <SectionHeader title="Group settings" subtitle="Applied across every entity, department and calculation" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Group name" className="sm:col-span-2">
                <Input value={settingsDraft.groupName} onChange={(e) => setSettingsDraft({ ...settingsDraft, groupName: e.target.value })} />
              </Field>
              <Field label="Working day starts">
                <Input type="time" value={settingsDraft.workingDayStart} onChange={(e) => setSettingsDraft({ ...settingsDraft, workingDayStart: e.target.value })} />
              </Field>
              <Field label="Working day ends">
                <Input type="time" value={settingsDraft.workingDayEnd} onChange={(e) => setSettingsDraft({ ...settingsDraft, workingDayEnd: e.target.value })} />
              </Field>
              <Field label="Performance threshold" hint="score below this escalates">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={settingsDraft.performanceThreshold}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, performanceThreshold: Number(e.target.value) })}
                />
              </Field>
              <Field label="Holiday horizon (years)">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={settingsDraft.holidayHorizonYears}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, holidayHorizonYears: Number(e.target.value) })}
                />
              </Field>
              <Field label="Week starts on">
                <Select
                  value={settingsDraft.weekStartsOn}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, weekStartsOn: Number(e.target.value) as 0 | 1 | 6 })}
                >
                  <option value={1}>Monday (ISO)</option>
                  <option value={0}>Sunday</option>
                  <option value={6}>Saturday</option>
                </Select>
              </Field>
              <div className="flex items-end">
                <Button
                  variant="primary"
                  disabled={!canEdit}
                  onClick={() => {
                    updateSettings(settingsDraft);
                    toast.push({ tone: 'success', title: 'Settings saved', description: 'Scores and calendars recalculate immediately.' });
                  }}
                >
                  <Save className="h-3.5 w-3.5" /> Save settings
                </Button>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="text-[11px] font-semibold text-slate-700">How the score is calculated</div>
              <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap text-[10px] leading-relaxed text-slate-500">{`utilization     = logged hours ÷ (working days × daily hours) × 100
utilizationScore = 100 − |utilization − 85| × 1.3   (clamped 0–100)
onTimeRate       = completed activities due in period ÷ all due in period
completionRate   = completed activities ÷ all in-period activities
score            = 40% utilizationScore + 35% onTimeRate + 25% completionRate`}</pre>
            </div>
          </Card>

          <div className="space-y-3">
            <Card>
              <SectionHeader title="Feeling check-in scale" subtitle={`Labels and colours for ${tenant?.name ?? 'this tenant'} · used in stand-ups and one-on-ones`} />
              <div className="mt-3 space-y-2">{feelingDraft.map((option, index) => <div key={option.value} className="flex items-center gap-2">
                <span className="w-4 text-xs font-semibold">{option.value}</span>
                <Input aria-label={`Feeling ${option.value} label`} value={option.label} maxLength={80} onChange={(event) => setFeelingDraft((rows) => rows.map((row, i) => i === index ? { ...row, label: event.target.value } : row))} />
                <input aria-label={`Feeling ${option.value} colour`} type="color" value={option.color} onChange={(event) => setFeelingDraft((rows) => rows.map((row, i) => i === index ? { ...row, color: event.target.value } : row))} className="h-9 w-11 rounded border border-slate-200" />
              </div>)}</div>
              <Button className="mt-3" size="sm" variant="primary" disabled={!canEdit || !tenant || feelingDraft.some((option) => !option.label.trim())} onClick={() => {
                if (!tenant) return;
                upsertTenant({ ...tenant, feelingScale: feelingDraft.map((option) => ({ ...option, label: option.label.trim() })) });
                toast.push({ tone: 'success', title: 'Feeling scale saved for this tenant' });
              }}><Save className="h-3.5 w-3.5" /> Save feeling scale</Button>
            </Card>
            <Card>
              <SectionHeader title="Workspace" subtitle={workspace.mode === 'shared' ? 'Shared Neon database' : 'Local demo storage'} />
              <div className="mt-2 space-y-1.5 text-[11px] text-slate-600">
                <Row label="Entities" value={state.entities.length} />
                <Row label="Departments" value={state.departments.length} />
                <Row label="Employees" value={state.employees.length} />
                <Row label="Activities" value={state.activities.length} />
                <Row label="Time entries" value={state.timeEntries.length} />
                <Row label="Holidays" value={state.holidays.length} />
                <Row label="Calendar connections" value={state.connections.filter((c) => c.status === 'connected').length} />
                <Row label="Audit records" value={state.auditLog.length} />
              </div>
            </Card>
            {workspace.mode === 'demo' ? <Card className="border-rose-200">
              <SectionHeader title="Danger zone" subtitle="Demo data lives in this browser only" />
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                Reset restores the seeded Meridian Group portfolio. In production this action maps to a schema reset and is restricted to the
                group administrator.
              </p>
              <Button
                className="mt-2 w-full"
                variant="danger"
                size="sm"
                onClick={() => {
                  if (confirm('Reset the entire workspace to the demo seed?')) {
                    resetDemo();
                    toast.push({ tone: 'success', title: 'Workspace reset' });
                  }
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Reset demo data
              </Button>
            </Card> : null}
          </div>
        </div>
      ) : null}

      {tab === 'audit' ? (
        <Card padded={false}>
          <div className="px-4 pt-4">
            <SectionHeader title="Audit trail" subtitle="Who changed what, when — the evidence trail auditors ask for" action={<Badge tone="neutral">{state.auditLog.length} events</Badge>} />
          </div>
          <div className="mt-2 max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {state.auditLog.map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <Avatar name={empMap.get(a.actorId)?.name ?? 'System'} color={empMap.get(a.actorId)?.avatarColor ?? '#94a3b8'} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-medium text-slate-800">{a.action}</span>
                    <span className="text-[10px] text-slate-400">by {empMap.get(a.actorId)?.name ?? 'system'}</span>
                  </div>
                  <div className="text-[10px] text-slate-500">{a.detail || '—'}</div>
                </div>
                <span className="flex-none text-[9px] tabular-nums text-slate-400">
                  {new Date(a.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
            {state.auditLog.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No audit events yet" description="Create an activity or change a setting to populate the trail." />
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Tenant modal */}
      <Modal
        open={!!tenantDraft}
        onClose={() => setTenantDraft(null)}
        title={tenants.some((row) => row.id === tenantDraft?.id) ? 'Edit tenant' : 'Add tenant'}
        subtitle="A tenant owns its own entity tree, departments, people and PTO policy. Nothing is shared with another tenant."
        width="max-w-2xl"
        footer={
          <>
            <Button size="sm" onClick={() => setTenantDraft(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                if (!tenantDraft?.name.trim() || !tenantDraft.code.trim()) {
                  toast.push({ tone: 'error', title: 'Name and code are required' });
                  return;
                }
                const draftDepartments = tenantDepartments(
                  { entities: state.entities.filter((entity) => entity.tenantId === tenantDraft.id), departments: state.departments },
                  tenantDraft.id,
                ).map((department) => department.id);
                upsertTenant({
                  ...tenantDraft,
                  calendarScope: normaliseCalendarScope(
                    tenantDraft.calendarScope,
                    draftDepartments.length ? draftDepartments : state.departments.map((department) => department.id),
                  ),
                });
                setTenantDraft(null);
                toast.push({ tone: 'success', title: 'Tenant saved', description: 'Isolation applies immediately to every screen.' });
              }}
            >
              <Check className="h-3.5 w-3.5" /> Save tenant
            </Button>
          </>
        }
      >
        {tenantDraft ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tenant name" className="sm:col-span-2">
              <Input value={tenantDraft.name} onChange={(e) => setTenantDraft({ ...tenantDraft, name: e.target.value })} placeholder="Harbourline Retail Australia" />
            </Field>
            <Field label="Short code">
              <Input value={tenantDraft.code} onChange={(e) => setTenantDraft({ ...tenantDraft, code: e.target.value.toUpperCase() })} placeholder="HRA" />
            </Field>
            <Field label="Reporting currency">
              <Input value={tenantDraft.currency} onChange={(e) => setTenantDraft({ ...tenantDraft, currency: e.target.value.toUpperCase() })} placeholder="AUD" />
            </Field>
            <Field label="Country">
              <Select value={tenantDraft.countryCode} onChange={(e) => setTenantDraft({ ...tenantDraft, countryCode: e.target.value })}>
                {state.countries.map((country) => (
                  <option key={country.code} value={country.code}>{country.flag} {country.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Timezone">
              <Input value={tenantDraft.timezone} onChange={(e) => setTenantDraft({ ...tenantDraft, timezone: e.target.value })} />
            </Field>
            <Field label="PTO entitlement (working days / year)" hint="public holidays excluded">
              <Input
                type="number"
                min={0}
                max={60}
                value={tenantDraft.ptoAnnualEntitlementDays}
                onChange={(e) => setTenantDraft({ ...tenantDraft, ptoAnnualEntitlementDays: Number(e.target.value) })}
              />
            </Field>
            <Field label="Status">
              <Select value={tenantDraft.status} onChange={(e) => setTenantDraft({ ...tenantDraft, status: e.target.value as Tenant['status'] })}>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </Select>
            </Field>
            <Field label="Calendar scope" className="sm:col-span-2">
              <Select
                value={tenantDraft.calendarScope.mode}
                onChange={(e) =>
                  setTenantDraft({
                    ...tenantDraft,
                    calendarScope: { mode: e.target.value as CalendarScopeMode, departmentIds: tenantDraft.calendarScope.departmentIds },
                  })
                }
              >
                {(['single', 'multiple', 'all'] as CalendarScopeMode[]).map((mode) => (
                  <option key={mode} value={mode}>{CALENDAR_SCOPE_LABELS[mode]}</option>
                ))}
              </Select>
            </Field>
            <p className="text-[10px] leading-relaxed text-slate-500 sm:col-span-2">
              {CALENDAR_SCOPE_HINTS[tenantDraft.calendarScope.mode]} Department selection is managed in the calendar-scope panel after switching to
              this tenant.
            </p>
          </div>
        ) : null}
      </Modal>

      {/* Entity modal */}
      <Modal
        open={!!entityDraft}
        onClose={() => setEntityDraft(null)}
        title={state.entities.some((e) => e.id === entityDraft?.id) ? 'Edit entity' : 'Add entity'}
        width="max-w-xl"
        footer={
          <>
            <Button size="sm" onClick={() => setEntityDraft(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                if (!entityDraft?.name.trim()) return;
                upsertEntity(entityDraft);
                setEntityDraft(null);
                toast.push({ tone: 'success', title: 'Entity saved' });
              }}
            >
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
          </>
        }
      >
        {entityDraft ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Legal name" className="sm:col-span-2">
              <Input value={entityDraft.name} onChange={(e) => setEntityDraft({ ...entityDraft, name: e.target.value })} placeholder="e.g. Meridian Contracting LLC" />
            </Field>
            <Field label="Short code">
              <Input value={entityDraft.code} onChange={(e) => setEntityDraft({ ...entityDraft, code: e.target.value.toUpperCase() })} placeholder="MCL" />
            </Field>
            <Field label="Type">
              <Select value={entityDraft.type} onChange={(e) => setEntityDraft({ ...entityDraft, type: e.target.value as Entity['type'] })}>
                <option value="company">Company</option>
                <option value="sub_company">Sub-company</option>
                <option value="group">Group holding</option>
              </Select>
            </Field>
            <Field label="Parent entity">
              <Select value={entityDraft.parentId ?? ''} onChange={(e) => setEntityDraft({ ...entityDraft, parentId: e.target.value || null })}>
                <option value="">None</option>
                {state.entities.filter((e) => e.id !== entityDraft.id).map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Country">
              <Select
                value={entityDraft.countryCode}
                onChange={(e) => {
                  const c = state.countries.find((x) => x.code === e.target.value);
                  setEntityDraft({ ...entityDraft, countryCode: e.target.value, timezone: c?.timezone ?? entityDraft.timezone });
                }}
              >
                {state.countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Timezone">
              <Input value={entityDraft.timezone} onChange={(e) => setEntityDraft({ ...entityDraft, timezone: e.target.value })} />
            </Field>
            <Field label="Industry">
              <Input value={entityDraft.industry ?? ''} onChange={(e) => setEntityDraft({ ...entityDraft, industry: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </Modal>

      {/* Department modal */}
      <Modal
        open={!!deptDraft}
        onClose={() => setDeptDraft(null)}
        title={state.departments.some((d) => d.id === deptDraft?.id) ? 'Edit department' : 'Add department'}
        width="max-w-xl"
        footer={
          <>
            <Button size="sm" onClick={() => setDeptDraft(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                if (!deptDraft?.name.trim() || !deptDraft.code.trim()) return;
                upsertDepartment(deptDraft);
                setDeptDraft(null);
                toast.push({ tone: 'success', title: 'Department saved' });
              }}
            >
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
          </>
        }
      >
        {deptDraft ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Department name" className="sm:col-span-2">
              <Input value={deptDraft.name} onChange={(e) => setDeptDraft({ ...deptDraft, name: e.target.value })} />
            </Field>
            <Field label="Code">
              <Input value={deptDraft.code} onChange={(e) => setDeptDraft({ ...deptDraft, code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Entity">
              <Select value={deptDraft.entityId} onChange={(e) => setDeptDraft({ ...deptDraft, entityId: e.target.value })}>
                {state.entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Department head">
              <Select value={deptDraft.headId ?? ''} onChange={(e) => setDeptDraft({ ...deptDraft, headId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {state.employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} · {ROLE_LABELS[e.role]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Operations owner">
              <Select value={deptDraft.opsOwnerId ?? ''} onChange={(e) => setDeptDraft({ ...deptDraft, opsOwnerId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {state.employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} · {ROLE_LABELS[e.role]}</option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3"><Toggle checked={deptDraft.devopsEnabled ?? false} onChange={(v) => setDeptDraft({ ...deptDraft, devopsEnabled: v })} label="Enable DevOps delivery workspace" description="Adds epics, features, tickets, nested streams and effort reporting for this department. Off by default for non-IT departments." /></div>
            <Field label="Cost centre">
              <Input value={deptDraft.costCenter} onChange={(e) => setDeptDraft({ ...deptDraft, costCenter: e.target.value })} />
            </Field>
            <Field label="Calendar colour">
              <div className="flex flex-wrap gap-1.5 pt-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setDeptDraft({ ...deptDraft, color: c })}
                    className={`h-6 w-6 rounded-full ring-offset-1 ${deptDraft.color === c ? 'ring-2 ring-slate-800' : ''}`}
                    style={{ background: c }}
                    aria-label={`Colour ${c}`}
                  />
                ))}
              </div>
            </Field>
          </div>
        ) : null}
      </Modal>

      {/* Sub-department modal */}
      <Modal
        open={!!streamDraft}
        onClose={() => setStreamDraft(null)}
        title={state.deliveryStreams.some((row) => row.id === streamDraft?.id) ? 'Edit sub-department' : 'Add sub-department'}
        subtitle="Nested teams are master data for every department and can also own a DevOps backlog."
        width="max-w-xl"
        footer={
          <>
            <Button size="sm" onClick={() => setStreamDraft(null)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={() => {
              if (!streamDraft) return;
              const result = upsertStream(streamDraft);
              if (result) {
                toast.push({ tone: 'error', title: 'Sub-department not saved', description: result });
                return;
              }
              setStreamDraft(null);
              toast.push({ tone: 'success', title: 'Sub-department saved', description: 'Employee and roadmap groupings now use the updated structure.' });
            }}><Check className="h-3.5 w-3.5" /> Save sub-department</Button>
          </>
        }
      >
        {streamDraft ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Sub-department name" className="sm:col-span-2"><Input autoFocus value={streamDraft.name} onChange={(event) => setStreamDraft({ ...streamDraft, name: event.target.value })} /></Field>
            <Field label="Unique code"><Input value={streamDraft.code} onChange={(event) => setStreamDraft({ ...streamDraft, code: event.target.value.toUpperCase() })} /></Field>
            <Field label="Department">
              <Select value={streamDraft.departmentId} onChange={(event) => setStreamDraft({ ...streamDraft, departmentId: event.target.value, parentId: null, leadId: null })}>
                {state.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </Select>
            </Field>
            <Field label="Parent sub-department">
              <Select value={streamDraft.parentId ?? ''} onChange={(event) => setStreamDraft({ ...streamDraft, parentId: event.target.value || null })}>
                <option value="">Top level</option>
                {state.deliveryStreams.filter((row) => row.departmentId === streamDraft.departmentId && row.id !== streamDraft.id).map((row) => <option key={row.id} value={row.id}>{streamPath(state.deliveryStreams, row.id).map((item) => item.name).join(' / ')}</option>)}
              </Select>
            </Field>
            <Field label="Accountable lead">
              <Select value={streamDraft.leadId ?? ''} onChange={(event) => setStreamDraft({ ...streamDraft, leadId: event.target.value || null })}>
                <option value="">Unassigned</option>
                {state.employees.filter((employee) => employee.departmentId === streamDraft.departmentId && employee.status !== 'inactive').map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employeeTitle(employee)}</option>)}
              </Select>
            </Field>
            <Field label="Calendar colour" className="sm:col-span-2">
              <div className="flex flex-wrap gap-1.5 pt-1">{COLORS.map((color) => <button type="button" key={color} onClick={() => setStreamDraft({ ...streamDraft, color })} className={`h-6 w-6 rounded-full ring-offset-1 ${streamDraft.color === color ? 'ring-2 ring-slate-800' : ''}`} style={{ background: color }} aria-label={`Colour ${color}`} />)}</div>
            </Field>
          </div>
        ) : null}
      </Modal>

      {/* Designation modal */}
      <Modal
        open={!!designationDraft}
        onClose={() => setDesignationDraft(null)}
        title={state.designations.some((row) => row.id === designationDraft?.id) ? 'Edit designation' : 'Add designation'}
        subtitle="This changes the business title only; employee access roles remain separate."
        width="max-w-xl"
        footer={
          <>
            <Button size="sm" onClick={() => setDesignationDraft(null)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={() => {
              if (!designationDraft) return;
              const result = upsertDesignation(designationDraft);
              if (result) {
                toast.push({ tone: 'error', title: 'Designation not saved', description: result });
                return;
              }
              setDesignationDraft(null);
              toast.push({ tone: 'success', title: 'Designation saved', description: 'Linked employee titles were updated automatically.' });
            }}><Check className="h-3.5 w-3.5" /> Save designation</Button>
          </>
        }
      >
        {designationDraft ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Designation title" className="sm:col-span-2"><Input autoFocus value={designationDraft.title} onChange={(event) => setDesignationDraft({ ...designationDraft, title: event.target.value })} placeholder="e.g. D365 Stream Lead" /></Field>
            <Field label="Short code"><Input value={designationDraft.code} onChange={(event) => setDesignationDraft({ ...designationDraft, code: event.target.value.toUpperCase() })} placeholder="D365-LEAD" /></Field>
            <Field label="Employees linked"><Input value={String(state.employees.filter((employee) => employee.designationId === designationDraft.id).length)} disabled readOnly /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea rows={3} value={designationDraft.description} onChange={(event) => setDesignationDraft({ ...designationDraft, description: event.target.value })} placeholder="Purpose, grade or responsibilities (optional)" /></Field>
          </div>
        ) : null}
      </Modal>

      {/* Employee modal */}
      <Modal
        open={!!empDraft}
        onClose={() => setEmpDraft(null)}
        title={state.employees.some((e) => e.id === empDraft?.id) ? 'Edit employee' : 'Add employee'}
        subtitle="Role drives access; designation and reporting line are editable. Co-CEO department portfolios can be assigned here without adding unrolled departments yet."
        width="max-w-2xl"
        footer={
          <>
            <Button size="sm" onClick={() => setEmpDraft(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                if (!empDraft?.name.trim() || !empDraft.email.trim()) return;
                upsertEmployee(empDraft);
                setEmpDraft(null);
                toast.push({ tone: 'success', title: 'Employee saved', description: 'Visibility recalculates on next render.' });
              }}
            >
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
          </>
        }
      >
        {empDraft ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={empDraft.name} onChange={(e) => setEmpDraft({ ...empDraft, name: e.target.value })} />
            </Field>
            <Field label="Work email">
              <Input type="email" value={empDraft.email} onChange={(e) => setEmpDraft({ ...empDraft, email: e.target.value })} placeholder="name@company.com" />
            </Field>
            <Field label="Employee code">
              <Input value={empDraft.code} onChange={(e) => setEmpDraft({ ...empDraft, code: e.target.value })} />
            </Field>
            <Field label="Role / access tier">
              <Select value={empDraft.role} onChange={(e) => setEmpDraft({ ...empDraft, role: e.target.value as Role })}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Designation / job title" hint="Business title; access stays separate">
              <div className="space-y-2">
                <Select
                  value={empDraft.designationId ?? 'custom'}
                  onChange={(event) => {
                    const designation = state.designations.find((row) => row.id === event.target.value);
                    setEmpDraft({
                      ...empDraft,
                      designationId: designation?.id,
                      jobTitle: designation?.title ?? empDraft.jobTitle ?? '',
                    });
                  }}
                >
                  <option value="custom">Custom designation</option>
                  {[...state.designations].sort((a, b) => a.title.localeCompare(b.title)).map((designation) => <option key={designation.id} value={designation.id}>{designation.title}</option>)}
                </Select>
                {!empDraft.designationId ? <Input value={empDraft.jobTitle ?? ''} onChange={(e) => setEmpDraft({ ...empDraft, jobTitle: e.target.value, designationId: undefined })} placeholder="Enter a custom business title" /> : null}
              </div>
            </Field>
            <Field label="Department">
              <Select
                value={empDraft.departmentId}
                onChange={(e) => {
                  const dept = deptMap.get(e.target.value);
                  setEmpDraft({ ...empDraft, departmentId: e.target.value, entityId: dept?.entityId ?? empDraft.entityId, streamId: undefined, supportingStreamIds: [] });
                }}
              >
                {state.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Home delivery stream" hint="optional · used for resource effort attribution">
              <Select value={empDraft.streamId ?? ''} onChange={(e) => setEmpDraft({ ...empDraft, streamId: e.target.value || undefined })}>
                <option value="">Unassigned</option>
                {state.deliveryStreams.filter((s) => s.departmentId === empDraft.departmentId).map((s) => <option key={s.id} value={s.id}>{streamPath(state.deliveryStreams, s.id).map((x) => x.name).join(' / ')}</option>)}
              </Select>
            </Field>
            <Field label="Supporting delivery streams" hint="Optional cross-functional work; the home stream stays separate.">
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {state.deliveryStreams.filter((s) => s.departmentId === empDraft.departmentId).map((stream) => {
                  const selected = empDraft.supportingStreamIds ?? [];
                  const checked = selected.includes(stream.id);
                  return (
                    <label key={stream.id} className="flex cursor-pointer items-center gap-2 text-[10px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setEmpDraft({
                          ...empDraft,
                          supportingStreamIds: checked ? selected.filter((id) => id !== stream.id) : [...selected, stream.id],
                        })}
                      />
                      {streamPath(state.deliveryStreams, stream.id).map((row) => row.name).join(' / ')}
                    </label>
                  );
                })}
                {!state.deliveryStreams.some((s) => s.departmentId === empDraft.departmentId) ? <span className="text-[10px] text-slate-400">No streams configured for this department.</span> : null}
              </div>
            </Field>
            <Field label="Engagement type">
              <Select value={empDraft.employmentType ?? 'employee'} onChange={(e) => setEmpDraft({ ...empDraft, employmentType: e.target.value as EmploymentType })}>
                <option value="employee">Employee</option>
                <option value="contractor">Contractor</option>
              </Select>
            </Field>
            <Field label="Work location">
              <Select value={empDraft.workLocation ?? ''} onChange={(e) => setEmpDraft({ ...empDraft, workLocation: (e.target.value || undefined) as WorkLocation | undefined })}>
                <option value="">Not specified</option>
                <option value="on_site">On site</option>
                <option value="hybrid">Hybrid</option>
                <option value="remote">Remote</option>
              </Select>
            </Field>
            <Field label="Cross-functional allocation notes" className="sm:col-span-2">
              <Textarea rows={2} value={empDraft.collaborationNotes ?? ''} onChange={(e) => setEmpDraft({ ...empDraft, collaborationNotes: e.target.value })} placeholder="For example: supports Data and Finance stakeholders" />
            </Field>
            {empDraft.role === 'ceo' || empDraft.role === 'head_operations' ? (
              <>
                <Field label="Leadership portfolio / responsibilities" className="sm:col-span-2" hint="Free text for future operating areas; create the departments and assign them below when ready.">
                  <Textarea rows={2} value={empDraft.leadershipPortfolio ?? ''} onChange={(e) => setEmpDraft({ ...empDraft, leadershipPortfolio: e.target.value })} placeholder="Describe the executive's operational portfolio" />
                </Field>
                <div className="sm:col-span-2 rounded-lg border border-slate-200 p-3">
                  <div className="text-[11px] font-medium text-slate-700">Departments in this executive portfolio</div>
                  <div className="mt-1 text-[10px] text-slate-400">This explicit list drives the co-CEO's department reporting scope. An empty list means no operational departments are assigned yet.</div>
                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                    {state.departments.map((department) => {
                      const selected = empDraft.responsibleDepartmentIds ?? state.departments.map((row) => row.id);
                      const checked = selected.includes(department.id);
                      return (
                        <label key={department.id} className="flex cursor-pointer items-center gap-2 text-[10px] text-slate-600">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => setEmpDraft({
                              ...empDraft,
                              responsibleDepartmentIds: checked ? selected.filter((id) => id !== department.id) : [...selected, department.id],
                            })}
                          />
                          {department.name} · {department.code}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
            <Field label="Legal entity">
              <Select value={empDraft.entityId} onChange={(e) => setEmpDraft({ ...empDraft, entityId: e.target.value })}>
                {state.entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Reports to">
              <Select value={empDraft.managerId ?? ''} onChange={(e) => setEmpDraft({ ...empDraft, managerId: e.target.value || null })}>
                <option value="">None (top of tree)</option>
                {state.employees.filter((e) => e.id !== empDraft.id).map((e) => (
                  <option key={e.id} value={e.id}>{e.name} · {employeeTitle(e)}</option>
                ))}
              </Select>
            </Field>
            <Field label="Country of employment">
              <Select value={empDraft.countryCode} onChange={(e) => setEmpDraft({ ...empDraft, countryCode: e.target.value })}>
                {state.countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Contracted hours / week">
              <Input type="number" min={1} max={80} value={empDraft.weeklyHours} onChange={(e) => setEmpDraft({ ...empDraft, weeklyHours: Number(e.target.value) })} />
            </Field>
            <Field label="Join date">
              <Input type="date" value={empDraft.joinDate} onChange={(e) => setEmpDraft({ ...empDraft, joinDate: e.target.value })} />
            </Field>
            <Field label="Status">
              <Select value={empDraft.status} onChange={(e) => setEmpDraft({ ...empDraft, status: e.target.value as Employee['status'] })}>
                <option value="active">Active</option>
                <option value="on_leave">On leave</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
            <Field label="Avatar colour">
              <div className="flex flex-wrap gap-1.5 pt-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEmpDraft({ ...empDraft, avatarColor: c })}
                    className={`h-5 w-5 rounded-full ring-offset-1 ${empDraft.avatarColor === c ? 'ring-2 ring-slate-800' : ''}`}
                    style={{ background: c }}
                    aria-label={`Colour ${c}`}
                  />
                ))}
              </div>
            </Field>
          </div>
        ) : null}
      </Modal>

      {/* Holiday modal */}
      <Modal
        open={!!holidayDraft}
        onClose={() => setHolidayDraft(null)}
        title={state.holidays.some((row) => row.id === holidayDraft?.id) ? 'Edit non-working day' : 'Add non-working day'}
        width="max-w-lg"
        footer={
          <>
            <Button size="sm" onClick={() => setHolidayDraft(null)}>Cancel</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                if (!holidayDraft?.name.trim()) return;
                addHoliday(holidayDraft);
                setHolidayDraft(null);
                toast.push({ tone: 'success', title: 'Holiday saved', description: 'Calendars and capacity recalculate.' });
              }}
            >
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
          </>
        }
      >
        {holidayDraft ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Country">
              <Select value={holidayDraft.countryCode} onChange={(e) => setHolidayDraft({ ...holidayDraft, countryCode: e.target.value })}>
                {state.countries.map((c) => (
                  <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Date">
              <Input type="date" value={holidayDraft.date} onChange={(e) => setHolidayDraft({ ...holidayDraft, date: e.target.value })} />
            </Field>
            <Field label="Holiday name" className="sm:col-span-2">
              <Input value={holidayDraft.name} onChange={(e) => setHolidayDraft({ ...holidayDraft, name: e.target.value })} placeholder="Company annual offsite" />
            </Field>
            <Field label="Type" className="sm:col-span-2">
              <Select value={holidayDraft.type} onChange={(e) => setHolidayDraft({ ...holidayDraft, type: e.target.value as Holiday['type'] })}>
                <option value="public_holiday">Public holiday</option>
                <option value="company_holiday">Company holiday</option>
                <option value="weekly_off">Weekly off</option>
              </Select>
            </Field>
          </div>
        ) : null}
      </Modal>

    </div>
  );
}
function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed border-slate-100 pb-1 last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold tabular-nums text-slate-800">{value}</span>
    </div>
  );
}
