import type { Activity, DeliveryStream, FundingClass, StoreState, WorkItem, WorkItemImportDefaults, WorkItemImportPreview, WorkItemImportRow, WorkItemKind } from '../types';
import { capitalisationEligibility } from './capitalisation';
import { fromISO, toISO, workingDays } from './dates';
import { eachDayOfInterval } from 'date-fns';

export const KIND_LABELS: Record<WorkItemKind, string> = { epic: 'Epic', feature: 'Feature', ticket: 'Ticket' };
export const FUNDING_LABELS: Record<FundingClass, string> = { capex: 'Capex', opex: 'Opex', unclassified: 'Unclassified' };
function stableImportId(key: string): string {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return `wi-${(hash >>> 0).toString(36)}-${key.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 65)}`;
}
export const roundHours = (n: number) => Math.round(n * 100) / 100;
export const deliveryDepartments = (state: StoreState) => state.departments.filter((d) => d.devopsEnabled);
export const externalKey = (item: Pick<WorkItem, 'organization' | 'devopsProject' | 'externalId'>) =>
  item.externalId ? `${item.organization.toLowerCase()}/${item.devopsProject.toLowerCase()}/${item.externalId}` : '';

/** Stream ancestry is bounded and cycle-safe, including for imported/legacy snapshots. */
export function streamPath(streams: DeliveryStream[], id: string | null | undefined): DeliveryStream[] {
  const map = new Map(streams.map((s) => [s.id, s]));
  const path: DeliveryStream[] = [];
  const seen = new Set<string>();
  let current = id ? map.get(id) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id); path.unshift(current); current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return path;
}
export function streamDescendants(streams: DeliveryStream[], id: string): Set<string> {
  const result = new Set<string>([id]);
  for (let pass = 0; pass < streams.length; pass++) {
    let changed = false;
    streams.forEach((s) => { if (s.parentId && result.has(s.parentId) && !result.has(s.id)) { result.add(s.id); changed = true; } });
    if (!changed) break;
  }
  return result;
}
export function validStreamParent(streams: DeliveryStream[], id: string, parentId: string | null, departmentId: string): boolean {
  if (!parentId) return true;
  const parent = streams.find((s) => s.id === parentId);
  return !!parent && parent.departmentId === departmentId && !streamDescendants(streams, id).has(parentId);
}

export function workItemPath(items: WorkItem[], id: string | null | undefined): WorkItem[] {
  const map = new Map(items.map((i) => [i.id, i]));
  const path: WorkItem[] = [];
  const seen = new Set<string>();
  let current = id ? map.get(id) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id); path.unshift(current); current = current.parentId ? map.get(current.parentId) : undefined;
  }
  return path;
}
export function workItemDescendants(items: WorkItem[], id: string): Set<string> {
  const result = new Set<string>([id]);
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    items.forEach((i) => { if (i.parentId && result.has(i.parentId) && !result.has(i.id)) { result.add(i.id); changed = true; } });
    if (!changed) break;
  }
  return result;
}
export function validateWorkItem(items: WorkItem[], item: WorkItem): string | null {
  if (!item.title.trim()) return 'A title is required.';
  if (!Number.isFinite(item.estimateHours) || item.estimateHours < 0 || item.estimateHours > 100000) return 'Estimate must be between 0 and 100,000 hours.';
  if (item.kind === 'epic' && item.parentId) return 'Epics sit at the top of the hierarchy.';
  const parent = items.find((i) => i.id === item.parentId);
  if (item.kind !== 'epic') {
    if (!parent) return `Select a parent ${item.kind === 'feature' ? 'epic' : 'feature'}.`;
    if (parent.kind !== (item.kind === 'feature' ? 'epic' : 'feature')) return `A ${item.kind} must belong to a ${item.kind === 'feature' ? 'epic' : 'feature'}.`;
    if (parent.departmentId !== item.departmentId) return 'The hierarchy must stay within one owning department.';
    if (parent.projectId !== item.projectId || parent.funding !== item.funding) return 'Project and funding classification must match the parent.';
  }
  if (item.kind === 'epic' && items.some((i) => i.parentId === item.id && (i.projectId !== item.projectId || i.funding !== item.funding))) return 'Update child features and tickets to the same project and funding first.';
  if (item.kind === 'feature' && items.some((i) => i.parentId === item.id && (i.projectId !== item.projectId || i.funding !== item.funding))) return 'Update child tickets to the same project and funding first.';
  if (item.funding === 'capex' && !item.projectId) return 'Capex work must link to a capital project and WBS.';
  return null;
}

/** Linking a backlog item supplies the financial context; it never invents actual hours. */
export function linkActivity(state: StoreState, activity: Activity, workItemId: string | undefined): Activity {
  const item = state.workItems.find((i) => i.id === workItemId);
  if (!item) return { ...activity, workItemId: undefined };
  const project = state.projects.find((p) => p.id === item.projectId);
  return {
    ...activity, workItemId: item.id,
    projectId: item.projectId ?? undefined,
    projectTaskId: undefined,
    projectPhase: item.phase,
    capitalisable: item.funding === 'capex' && project?.portfolio === 'capital',
    streamId: state.deliveryStreams.find((s) => s.id === activity.streamId && s.departmentId === activity.departmentId)?.id ?? state.employees.find((e) => e.id === activity.assigneeId && e.departmentId === activity.departmentId)?.streamId,
  };
}

/** Prorate a multi-day plan across its working days, rather than counting the whole plan every week. */
export function plannedHoursInPeriod(state: StoreState, activity: Activity, start: string, end: string): number {
  if (activity.status === 'cancelled' || activity.endDate < start || activity.startDate > end) return 0;
  const employee = state.employees.find((e) => e.id === activity.assigneeId);
  const country = state.countries.find((c) => c.code === employee?.countryCode);
  const off = country?.weeklyOff ?? [0, 6];
  const count = (a: string, b: string) => workingDays(a, b, off, state.holidays, employee?.countryCode ?? 'AU');
  const total = count(activity.startDate, activity.endDate);
  const overlap = count(activity.startDate > start ? activity.startDate : start, activity.endDate < end ? activity.endDate : end);
  if (total > 0) return activity.plannedHours * overlap / total;
  const days = eachDayOfInterval({ start: fromISO(activity.startDate), end: fromISO(activity.endDate) }).length;
  const clipped = eachDayOfInterval({ start: fromISO(activity.startDate > start ? activity.startDate : start), end: fromISO(activity.endDate < end ? activity.endDate : end) }).length;
  return activity.plannedHours * clipped / Math.max(1, days);
}

export interface EffortFilters {
  start: string; end: string; departmentId: string; employeeId: string; streamId: string;
  epicId: string; featureId: string; ticketId: string; funding: FundingClass | 'all' | 'unlinked'; approvedOnly: boolean;
}
export interface EffortLine {
  id: string; date: string; employeeId: string; employeeName: string; departmentId: string; streamId: string;
  activityId: string; activityTitle: string; workItemId: string; epicId: string; featureId: string; ticketId: string;
  projectId: string; funding: FundingClass | 'unlinked'; hours: number; plannedHours: number;
  approved: boolean; capexEligible: boolean; capitalisedHours: number; capitalisedCost: number;
}
export interface EffortGroup {
  id: string; label: string; subtitle: string; hours: number; plannedHours: number; approvedHours: number;
  capexHours: number; eligibleHours: number; capitalisedCost: number; resources: number; departments: number; lines: EffortLine[];
}
export type EffortDimension = 'epic' | 'feature' | 'ticket' | 'resource' | 'department' | 'stream' | 'funding';

/** Each timesheet row appears once in the detail ledger; ancestor rollups are not added together. */
export function effortReport(state: StoreState, filters: EffortFilters) {
  const employees = new Map(state.employees.map((e) => [e.id, e]));
  const activities = new Map(state.activities.map((a) => [a.id, a]));
  const items = new Map(state.workItems.map((i) => [i.id, i]));
  const streams = new Map(state.deliveryStreams.map((s) => [s.id, s]));
  const enabled = new Set(deliveryDepartments(state).map((d) => d.id));
  const streamIds = filters.streamId === 'all' ? null : streamDescendants(state.deliveryStreams, filters.streamId);
  const matches = (item: WorkItem | undefined, employeeId: string, funding: string, activity: Activity) => {
    const employee = employees.get(employeeId);
    const path = workItemPath(state.workItems, item?.id);
    const executingStream = activity.streamId ?? employee?.streamId ?? item?.streamId ?? '';
    return !!employee && enabled.has(employee.departmentId)
      && (filters.departmentId === 'all' || employee.departmentId === filters.departmentId)
      && (filters.employeeId === 'all' || employeeId === filters.employeeId)
      && (!streamIds || streamIds.has(executingStream))
      && (filters.epicId === 'all' || path.some((i) => i.id === filters.epicId))
      && (filters.featureId === 'all' || path.some((i) => i.id === filters.featureId))
      && (filters.ticketId === 'all' || path.some((i) => i.id === filters.ticketId))
      && (filters.funding === 'all' || funding === filters.funding);
  };
  const context = (activity: Activity) => {
    const item = items.get(activity.workItemId ?? '');
    const path = workItemPath(state.workItems, item?.id);
    return { item, path, funding: (item?.funding ?? (activity.workItemId ? 'unclassified' : 'unlinked')) as FundingClass | 'unlinked' };
  };
  const lines: EffortLine[] = [];
  state.timeEntries.forEach((entry) => {
    if (entry.date < filters.start || entry.date > filters.end || (filters.approvedOnly && !entry.approved)) return;
    const activity = activities.get(entry.activityId);
    const employee = employees.get(entry.employeeId);
    if (!activity || !employee) return;
    const { item, path, funding } = context(activity);
    if (!matches(item, entry.employeeId, funding, activity)) return;
    const project = state.projects.find((p) => p.id === (item?.projectId ?? activity.projectId));
    const eligible = capitalisationEligibility(state, activity, project).eligible;
    const capitalisedHours = eligible ? entry.hours * (project?.capitalisationRate ?? 0) : 0;
    lines.push({
      id: entry.id, date: entry.date, employeeId: employee.id, employeeName: employee.name,
      departmentId: employee.departmentId, streamId: activity.streamId ?? employee.streamId ?? item?.streamId ?? '',
      activityId: activity.id, activityTitle: activity.title, workItemId: item?.id ?? '',
      epicId: path.find((i) => i.kind === 'epic')?.id ?? '', featureId: path.find((i) => i.kind === 'feature')?.id ?? '',
      ticketId: path.find((i) => i.kind === 'ticket')?.id ?? '', projectId: project?.id ?? '', funding: funding as FundingClass | 'unlinked',
      hours: entry.hours, plannedHours: 0, approved: entry.approved, capexEligible: eligible,
      capitalisedHours, capitalisedCost: capitalisedHours * (employee.costRateAUD ?? state.capitalisation.roleCostRates[employee.role] ?? 0),
    });
  });
  state.activities.forEach((activity) => {
    const { item, funding } = context(activity);
    if (!matches(item, activity.assigneeId, funding, activity)) return;
    const planned = plannedHoursInPeriod(state, activity, filters.start, filters.end);
    if (!planned) return;
    // Attach a plan to its own actual line where one exists; otherwise keep a plan-only line.
    const actual = lines.find((l) => l.activityId === activity.id && l.employeeId === activity.assigneeId);
    if (actual) actual.plannedHours += planned;
    else {
      const employee = employees.get(activity.assigneeId)!;
      const path = workItemPath(state.workItems, item?.id);
      lines.push({ id: `plan-${activity.id}`, date: activity.startDate, employeeId: employee.id, employeeName: employee.name,
        departmentId: employee.departmentId, streamId: activity.streamId ?? employee.streamId ?? item?.streamId ?? '',
        activityId: activity.id, activityTitle: activity.title, workItemId: item?.id ?? '',
        epicId: path.find((i) => i.kind === 'epic')?.id ?? '', featureId: path.find((i) => i.kind === 'feature')?.id ?? '',
        ticketId: path.find((i) => i.kind === 'ticket')?.id ?? '', projectId: item?.projectId ?? activity.projectId ?? '',
        funding: funding as FundingClass | 'unlinked', hours: 0, plannedHours: planned, approved: false, capexEligible: false, capitalisedHours: 0, capitalisedCost: 0 });
    }
  });
  const sum = (rows: EffortLine[], key: 'hours' | 'plannedHours' | 'capitalisedCost') => roundHours(rows.reduce((n, l) => n + l[key], 0));
  const totals = {
    hours: sum(lines, 'hours'), plannedHours: sum(lines, 'plannedHours'),
    approvedHours: roundHours(lines.filter((l) => l.approved).reduce((n, l) => n + l.hours, 0)),
    capexHours: roundHours(lines.filter((l) => l.funding === 'capex').reduce((n, l) => n + l.hours, 0)),
    eligibleHours: roundHours(lines.filter((l) => l.capexEligible).reduce((n, l) => n + l.hours, 0)),
    capitalisedCost: sum(lines, 'capitalisedCost'),
    resources: new Set(lines.filter((l) => l.hours > 0).map((l) => l.employeeId)).size,
    departments: new Set(lines.filter((l) => l.hours > 0).map((l) => l.departmentId)).size,
  };
  const group = (dimension: EffortDimension): EffortGroup[] => {
    const groups = new Map<string, EffortLine[]>();
    const identity = (l: EffortLine): [string, string, string] => {
      if (dimension === 'resource') return [l.employeeId, l.employeeName, state.departments.find((d) => d.id === l.departmentId)?.name ?? ''];
      if (dimension === 'department') { const d = state.departments.find((d) => d.id === l.departmentId); return [l.departmentId, d?.name ?? 'Unknown', d?.costCenter ?? '']; }
      if (dimension === 'stream') { const s = streams.get(l.streamId); return [l.streamId || 'unassigned', s ? streamPath(state.deliveryStreams, s.id).map((x) => x.name).join(' / ') : 'Unassigned stream', s ? state.employees.find((e) => e.id === s.leadId)?.name ?? 'No lead' : '']; }
      if (dimension === 'funding') return [l.funding, FUNDING_LABELS[l.funding as FundingClass] ?? 'Unlinked / BAU', 'Funding tag is not accounting approval'];
      const id = l[dimension === 'epic' ? 'epicId' : dimension === 'feature' ? 'featureId' : 'ticketId'];
      const item = items.get(id);
      return [id || 'unlinked', item?.title ?? 'Unlinked / direct effort', item ? `${KIND_LABELS[item.kind]} · ${item.externalId || 'Manual'} · ${state.projects.find((p) => p.id === item.projectId)?.code ?? 'No project'}` : ''];
    };
    lines.forEach((l) => { const [id] = identity(l); groups.set(id, [...(groups.get(id) ?? []), l]); });
    return Array.from(groups.entries()).map(([id, rows]) => {
      const [, label, subtitle] = identity(rows[0]);
      return { id, label, subtitle, hours: sum(rows, 'hours'), plannedHours: sum(rows, 'plannedHours'),
        approvedHours: roundHours(rows.filter((l) => l.approved).reduce((n, l) => n + l.hours, 0)),
        capexHours: roundHours(rows.filter((l) => l.funding === 'capex').reduce((n, l) => n + l.hours, 0)),
        eligibleHours: roundHours(rows.filter((l) => l.capexEligible).reduce((n, l) => n + l.hours, 0)),
        capitalisedCost: sum(rows, 'capitalisedCost'), resources: new Set(rows.filter((l) => l.hours > 0).map((l) => l.employeeId)).size,
        departments: new Set(rows.filter((l) => l.hours > 0).map((l) => l.departmentId)).size, lines: rows };
    }).sort((a, b) => b.hours - a.hours || a.label.localeCompare(b.label));
  };
  return { lines: lines.sort((a, b) => b.date.localeCompare(a.date)), totals, group };
}

export const IMPORT_COLUMNS = ['externalId', 'kind', 'title', 'parentExternalId', 'description', 'departmentCode', 'projectCode', 'streamCode', 'assigneeEmail', 'funding', 'phase', 'status', 'estimateHours', 'externalUrl', 'organization', 'devopsProject'] as const;
export const IMPORT_TEMPLATE = [
  IMPORT_COLUMNS.join(','),
  '1001,epic,Customer platform modernisation,,,,RIT,,,,unclassified,discovery,not_started,0,,contoso,Retail',
  '1002,feature,Checkout improvements,1001,,RIT,,,,unclassified,build,in_progress,80,,contoso,Retail',
  '1003,ticket,Implement payment adapter,1002,,RIT,,,,unclassified,build,not_started,24,,contoso,Retail',
].join('\n') + '\n';

/** RFC-4180-style CSV: quoted commas, escaped quotes and multiline fields. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(field); if (row.some((v) => v.trim())) rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(field); if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
const cleanHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES: Record<string, string> = {
  externalid: 'externalId', parentexternalid: 'parentExternalId', departmentcode: 'departmentCode', projectcode: 'projectCode',
  streamcode: 'streamCode', assigneeemail: 'assigneeEmail', estimatehours: 'estimateHours', externalurl: 'externalUrl', devopsproject: 'devopsProject',
  id: 'externalId', systemid: 'externalId', workitemtype: 'kind', systemworkitemtype: 'kind', type: 'kind',
  systemtitle: 'title', parent: 'parentExternalId', parentid: 'parentExternalId', systemparent: 'parentExternalId',
  systemdescription: 'description', systemstate: 'status', state: 'status', assignedto: 'assigneeEmail', systemassignedto: 'assigneeEmail',
  originalestimate: 'estimateHours', microsoftvstsschedulingoriginalestimate: 'estimateHours', effort: 'estimateHours',
  systemteamproject: 'devopsProject', project: 'devopsProject', url: 'externalUrl', tags: '',
};
const KINDS: Record<string, WorkItemKind> = { epic: 'epic', feature: 'feature', ticket: 'ticket', task: 'ticket', bug: 'ticket', userstory: 'ticket', productbacklogitem: 'ticket', issue: 'ticket' };
const STATUSES: Record<string, WorkItem['status']> = { new: 'not_started', notstarted: 'not_started', proposed: 'not_started', todo: 'not_started', active: 'in_progress', inprogress: 'in_progress', doing: 'in_progress', resolved: 'completed', done: 'completed', completed: 'completed', closed: 'completed', blocked: 'blocked', removed: 'cancelled', cancelled: 'cancelled' };
export function parseImport(text: string, format: 'csv' | 'json'): Record<string, unknown>[] {
  if (new TextEncoder().encode(text).length > 512 * 1024) throw new Error('Use a file smaller than 512 KB (up to 500 rows).');
  let raw: Record<string, unknown>[];
  if (format === 'json') {
    const parsed = JSON.parse(text); raw = Array.isArray(parsed) ? parsed : parsed?.items;
    if (!Array.isArray(raw)) throw new Error('JSON must be an array of rows, or an object with an items array.');
  } else {
    const csv = parseCSV(text);
    if (csv.length < 2) throw new Error('The file needs a header and at least one work item.');
    const headers = csv[0].map((h) => { const key = cleanHeader(h); return ALIASES[key] ?? key; });
    if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error('The CSV contains duplicate column names.');
    raw = csv.slice(1).map((values) => {
      if (values.length !== headers.length) throw new Error('A CSV row has a different number of columns from the header. Check quoted commas.');
      return Object.fromEntries(headers.map((h, i) => [h || `unused${i}`, values[i].trim()]));
    });
  }
  if (raw.length < 1 || raw.length > 500) throw new Error('Import between 1 and 500 work items at a time.');
  return raw.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`Row ${index + 2}: expected an object.`);
    const normalized = Object.fromEntries(Object.entries(row).map(([k, v]) => { const key = cleanHeader(k); return [ALIASES[key] ?? key, v]; }));
    const value = (key: string) => String(normalized[key] ?? '').trim();
    const kind = KINDS[cleanHeader(value('kind'))];
    if (!kind) throw new Error(`Row ${index + 2}: kind must be epic, feature or ticket (Azure Task/Bug/User Story map to ticket).`);
    const statusText = value('status');
    const status = statusText ? STATUSES[cleanHeader(statusText)] : '';
    if (statusText && !status) throw new Error(`Row ${index + 2}: unsupported status "${statusText}".`);
    const estimate = value('estimateHours') === '' ? null : Number(value('estimateHours'));
    const emailMatch = value('assigneeEmail').match(/<([^<>]+)>/);
    return { ...normalized, source: normalized.source === 'azure_devops' ? 'azure_devops' : format === 'json' ? 'json' : 'csv', externalId: value('externalId'), kind, title: value('title'), parentExternalId: value('parentExternalId'),
      description: value('description'), departmentCode: value('departmentCode'), projectCode: value('projectCode'), streamCode: value('streamCode'),
      assigneeEmail: emailMatch?.[1] ?? value('assigneeEmail'), funding: value('funding').toLowerCase(),
      phase: value('phase').toLowerCase(), status, estimateHours: estimate,
      externalUrl: value('externalUrl'), organization: value('organization'), devopsProject: value('devopsProject') };
  });
}

/** Pure, all-or-nothing import preview. Re-imports upsert by organization/project/external ID. */
export function previewImport(state: StoreState, raw: Record<string, unknown>[], defaults: WorkItemImportDefaults, now = new Date().toISOString()): WorkItemImportPreview {
  const errors: string[] = []; const warnings: string[] = [];
  const result: WorkItem[] = [];
  const existing = new Map(state.workItems.map((i) => [i.id, i]));
  const byExternal = new Map(state.workItems.filter((i) => externalKey(i)).map((i) => [externalKey(i), i]));
  const seen = new Set<string>();
  const phases = ['discovery', 'design', 'build', 'test', 'deploy', 'hypercare', 'support', 'training'];
  raw.forEach((r, index) => {
    const row = r as unknown as WorkItemImportRow; const at = `Row ${index + 2}`;
    if (!row.externalId || !row.title) errors.push(`${at}: externalId and title are required.`);

    const department = row.departmentCode ? state.departments.find((d) => d.code.toLowerCase() === row.departmentCode.toLowerCase()) : state.departments.find((d) => d.id === defaults.departmentId);
    if (!department?.devopsEnabled) errors.push(`${at}: department is not enabled for DevOps delivery.`);
    const organization = row.organization || defaults.organization || 'manual';
    const devopsProject = row.devopsProject || defaults.devopsProject || 'import';
    const key = externalKey({ organization, devopsProject, externalId: row.externalId });
    if (seen.has(key)) errors.push(`${at}: duplicate work item ID ${row.externalId}.`); seen.add(key);
    const previous = byExternal.get(key);
    const estimateHours = row.estimateHours ?? previous?.estimateHours ?? 0;
    const funding = row.funding || previous?.funding || defaults.funding || 'unclassified';
    const phase = row.phase || previous?.phase || 'discovery';
    const status = row.status || previous?.status || 'not_started';
    if (!Number.isFinite(estimateHours) || estimateHours < 0 || estimateHours > 100000) errors.push(`${at}: invalid estimateHours.`);
    if (!['capex', 'opex', 'unclassified'].includes(funding)) errors.push(`${at}: funding must be capex, opex or unclassified.`);
    if (!phases.includes(phase)) errors.push(`${at}: invalid phase.`);
    const project = row.projectCode ? state.projects.find((p) => p.code.toLowerCase() === row.projectCode.toLowerCase()) : state.projects.find((p) => p.id === (previous?.projectId ?? defaults.projectId));
    if (row.projectCode && !project) errors.push(`${at}: unknown projectCode ${row.projectCode}.`);
    const stream = row.streamCode ? state.deliveryStreams.find((s) => s.departmentId === department?.id && s.code.toLowerCase() === row.streamCode.toLowerCase()) : state.deliveryStreams.find((s) => s.id === (previous?.streamId ?? defaults.streamId));
    if (row.streamCode && !stream) errors.push(`${at}: unknown streamCode ${row.streamCode} in this department.`);
    const assignee = row.assigneeEmail ? state.employees.find((e) => e.email.toLowerCase() === row.assigneeEmail.toLowerCase()) : state.employees.find((e) => e.id === previous?.assigneeId);
    if (row.assigneeEmail && !assignee) errors.push(`${at}: assigneeEmail does not match a resource in this tenant.`);
    if (funding === 'capex' && project?.portfolio !== 'capital') errors.push(`${at}: capex requires an existing capital project.`);
    if (row.externalUrl && !/^https:\/\/(dev\.azure\.com\/|[a-z0-9-]+\.visualstudio\.com\/)/i.test(row.externalUrl)) errors.push(`${at}: externalUrl must be an Azure DevOps HTTPS link.`);
    const item: WorkItem = {
      id: previous?.id ?? stableImportId(key),
      kind: row.kind, title: row.title, description: row.description || previous?.description || '', parentId: null,
      departmentId: department?.id ?? defaults.departmentId, streamId: stream?.id ?? null, projectId: project?.id ?? null,
      assigneeId: assignee?.id ?? null, funding, phase, status, priority: previous?.priority ?? 'medium',
      estimateHours, source: row.source ?? previous?.source ?? 'csv', externalId: row.externalId, externalUrl: row.externalUrl || previous?.externalUrl || '',
      organization, devopsProject, createdAt: previous?.createdAt ?? now, updatedAt: now,
    };
    result.push(item); existing.set(item.id, item);
  });
  // Resolve parents after all rows are read, so file order does not matter.
  raw.forEach((r, index) => {
    const row = r as unknown as WorkItemImportRow; const item = result[index];
    const organization = row.organization || defaults.organization || 'manual'; const devopsProject = row.devopsProject || defaults.devopsProject || 'import';
    if (row.parentExternalId) {
      const parent = byExternal.get(externalKey({ organization, devopsProject, externalId: row.parentExternalId })) ?? result.find((i) => i.organization === organization && i.devopsProject === devopsProject && i.externalId === row.parentExternalId);
      if (!parent) errors.push(`Row ${index + 2}: parent ${row.parentExternalId} is not in this file or workspace.`);
      item.parentId = parent?.id ?? null;
    }
  });
  result.forEach((item, index) => {
    const error = validateWorkItem(Array.from(existing.values()), item);
    if (error) errors.push(`Row ${index + 2}: ${error}`);
  });
  if (errors.length) return { items: [], created: 0, updated: 0, unchanged: 0, errors, warnings };
  let created = 0, updated = 0, unchanged = 0;
  result.forEach((item) => {
    const previous = state.workItems.find((i) => i.id === item.id);
    if (!previous) created++;
    else if (JSON.stringify({ ...previous, updatedAt: '' }) === JSON.stringify({ ...item, updatedAt: '' })) unchanged++;
    else updated++;
  });
  if (result.some((i) => i.funding === 'unclassified')) warnings.push('Unclassified work is reported separately; it is not automatically capex.');
  warnings.push('Importing backlog metadata does not create calendar bookings or log actual hours. Existing activity links and timesheets are preserved.');
  return { items: result, created, updated, unchanged, errors, warnings };
}

export function parseAzureWorkItemUrl(input: string) {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('Enter a full Azure DevOps work item URL.'); }
  const legacy = url.hostname.match(/^([a-z0-9-]+)\.visualstudio\.com$/i);
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const modern = url.hostname === 'dev.azure.com';
  if (url.search || url.hash || url.protocol !== 'https:' || url.username || url.password || url.port || (!legacy && !modern)) throw new Error('Use an https://dev.azure.com/… or https://organisation.visualstudio.com/… link.');
  const organization = modern ? parts[0] : legacy![1];
  const project = modern ? parts[1] : parts[0];
  const edit = parts.indexOf('_workitems');
  const api = parts.indexOf('_apis');
  const id = edit >= 0 && parts[edit + 1] === 'edit' ? parts[edit + 2] : api >= 0 && parts[api + 1] === 'wit' && parts[api + 2] === 'workitems' ? parts[api + 3] : '';
  if (!organization || !project || !id || !/^\d+$/.test(id)) throw new Error('The link must point to one work item, ending in /_workitems/edit/123.');
  return { organization, project, id, canonicalUrl: `https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_workitems/edit/${id}` };
}

export const todayISO = () => toISO(new Date());
