import type { AppFilters, StoreState, ViewKey } from '../types';
import type { Scope } from './permissions';
import { departmentsInEntityScope, entityScopeLabel, entitySubtreeIds } from './entities';
import { filterActivities, filterEntries, groupScore } from './analytics';
import { buildStandupPulses } from './standups';
import { fromISO, humanHours, periodLabel, periodRange, toISO } from './dates';

/* ------------------------------------------------------------------ */
/* Live context for the AI guide                                       */
/*                                                                     */
/* The sticky note never prints a seeded string. Every line below is   */
/* read from the same snapshot the screen above it is reading, so the  */
/* note and the page can never disagree.                                */
/* ------------------------------------------------------------------ */

export interface LiveFact {
  label: string;
  value: string;
}

const entityIdFor = (filters: AppFilters) =>
  filters.entityId && filters.entityId !== 'all' ? filters.entityId : '';

export function buildLiveFacts({
  view,
  state,
  scope,
  filters,
}: {
  view: ViewKey;
  state: StoreState;
  scope: Scope;
  filters: AppFilters;
}): LiveFact[] {
  const today = toISO(new Date());
  const entityId = entityIdFor(filters);
  const entityIds = entityId ? entitySubtreeIds(state.entities, entityId) : null;
  const entityName = entityId ? entityScopeLabel(state.entities, entityId) : 'All entities in scope';
  const departments = departmentsInEntityScope(state.entities, scope.visibleDepartments, entityId || 'all');
  const departmentIds = departments.map((department) => department.id);
  const people = state.employees.filter((employee) => departmentIds.includes(employee.departmentId) && employee.status !== 'inactive');
  const anchor = fromISO(filters.anchor);
  const range = periodRange(anchor, filters.period, state.settings.weekStartsOn);
  const rangeISO = { start: toISO(range.start), end: toISO(range.end) };
  const periodFacts: LiveFact[] = [
    { label: 'Entity', value: entityName },
    { label: 'Period', value: periodLabel(anchor, filters.period) },
  ];
  const inPeriod = () => filterActivities(state, { departmentIds, start: rangeISO.start, end: rangeISO.end });

  switch (view) {
    case 'dashboard': {
      const summary = groupScore(state, departmentIds, filters.period, anchor);
      const escalations = state.escalations.filter(
        (escalation) => escalation.status === 'open' && departmentIds.includes(escalation.departmentId),
      ).length;
      return [
        ...periodFacts,
        { label: 'Departments', value: `${departments.length} depts · ${people.length} people` },
        { label: 'Logged / capacity', value: `${humanHours(summary.loggedHours)} / ${humanHours(summary.capacityHours)}` },
        { label: 'Delivery score', value: `${summary.score}/100 · ${summary.utilization}% utilized` },
        { label: 'Open escalations', value: String(escalations) },
      ];
    }
    case 'calendar': {
      const activities = inPeriod();
      const holidays = state.holidays.filter(
        (holiday) =>
          holiday.date >= rangeISO.start &&
          holiday.date <= rangeISO.end &&
          people.some((person) => person.countryCode === holiday.countryCode),
      ).length;
      return [
        ...periodFacts,
        { label: 'Activities in period', value: String(activities.length) },
        { label: 'Non-working days', value: `${holidays} in period` },
        { label: 'People in scope', value: String(people.length) },
      ];
    }
    case 'activities': {
      const scoped = state.activities.filter((activity) => departmentIds.includes(activity.departmentId));
      const overdue = scoped.filter(
        (activity) => activity.endDate < today && activity.status !== 'completed' && activity.status !== 'cancelled',
      ).length;
      const open = scoped.filter((activity) => activity.status !== 'completed' && activity.status !== 'cancelled').length;
      return [
        { label: 'Entity', value: entityName },
        { label: 'Register', value: `${scoped.length} activities` },
        { label: 'Still open', value: String(open) },
        { label: 'Overdue', value: `${overdue} need follow-up` },
      ];
    }
    case 'roadmap': {
      const scoped = state.activities.filter((activity) => departmentIds.includes(activity.departmentId));
      return [
        { label: 'Entity', value: entityName },
        { label: 'Rows', value: `${departments.length} departments · ${people.length} people` },
        { label: 'Activities', value: `${scoped.length} with real dates` },
      ];
    }
    case 'timesheet': {
      const entries = filterEntries(state, { departmentIds, start: rangeISO.start, end: rangeISO.end });
      const pending = entries.filter((entry) => !entry.approved).length;
      const hours = entries.reduce((total, entry) => total + entry.hours, 0);
      return [
        ...periodFacts,
        { label: 'Logged', value: `${humanHours(hours)} in ${entries.length} entries` },
        { label: 'Awaiting approval', value: `${pending} entries` },
        { label: 'People in scope', value: String(people.length) },
      ];
    }
    case 'projects': {
      const projects = state.projects.filter((project) => !entityIds || entityIds.has(project.entityId));
      const capital = projects.filter((project) => project.portfolio === 'capital');
      const capex = capital.reduce((total, project) => total + project.capexAUD, 0);
      return [
        { label: 'Entity', value: entityName },
        { label: 'Portfolio', value: `${projects.length} projects · ${capital.length} capital` },
        { label: 'Board-approved capex', value: `AUD ${Math.round(capex).toLocaleString('en-AU')}` },
        { label: 'Active', value: `${projects.filter((project) => project.status === 'active').length} delivering` },
      ];
    }
    case 'capitalisation': {
      const approvals = state.capitalisationApprovals.filter((approval) => !entityIds || entityIds.has(approval.entityId));
      const submitted = approvals.filter((approval) => approval.status === 'submitted').length;
      const approved = approvals.filter((approval) => approval.status === 'approved').length;
      return [
        { label: 'Entity', value: entityName },
        { label: 'Pack periods', value: `${approvals.length} on file` },
        { label: 'Awaiting decision', value: `${submitted} submitted` },
        { label: 'Approved', value: `${approved} by the board` },
      ];
    }
    case 'performance': {
      const summary = groupScore(state, departmentIds, filters.period, anchor);
      const below = summary.departments.filter((department) => department.score < state.settings.performanceThreshold).length;
      return [
        ...periodFacts,
        { label: 'Departments scored', value: String(summary.departments.length) },
        { label: 'Below threshold', value: `${below} under ${state.settings.performanceThreshold}` },
        { label: 'Delivery score', value: `${summary.score}/100` },
      ];
    }
    case 'standups': {
      const pulses = buildStandupPulses(state, departmentIds, today);
      const submitted = pulses.reduce((total, pulse) => total + pulse.submittedCount, 0);
      const members = pulses.reduce((total, pulse) => total + pulse.memberCount, 0);
      const blockers = pulses.reduce((total, pulse) => total + pulse.blockerCount, 0);
      const support = pulses.reduce((total, pulse) => total + pulse.openSupportCount, 0);
      const cross = pulses.reduce((total, pulse) => total + pulse.crossFunctionalCount, 0);
      return [
        { label: 'Date', value: today },
        { label: 'Departments tracked', value: String(pulses.length) },
        { label: 'Submitted today', value: `${submitted} of ${members} people` },
        { label: 'Blockers', value: String(blockers) },
        { label: 'Open support', value: `${support} (${cross} cross-functional)` },
      ];
    }
    case 'integrations': {
      const connected = state.connections.filter((connection) => connection.status === 'connected').length;
      const failed = state.syncJobs.filter((job) => job.status === 'failed').length;
      return [
        { label: 'Mailboxes connected', value: String(connected) },
        { label: 'Failed syncs', value: `${failed} to retry` },
        { label: 'Queued jobs', value: `${state.syncJobs.filter((job) => job.status === 'queued').length} waiting` },
      ];
    }
    case 'admin': {
      return [
        { label: 'Entities', value: String(state.entities.length) },
        { label: 'Departments', value: String(state.departments.length) },
        { label: 'People', value: String(state.employees.length) },
        { label: 'Holiday records', value: String(state.holidays.length) },
      ];
    }
    case 'whats-new': {
      return [
        { label: 'Workspace', value: state.settings.groupName },
        { label: 'Entities', value: String(state.entities.length) },
        { label: 'Departments', value: String(state.departments.length) },
      ];
    }
    case 'theme-studio': {
      const selected = entityId ? state.entities.find((entity) => entity.id === entityId) : undefined;
      return [
        { label: 'Selected entity', value: entityName },
        { label: 'Accent', value: selected?.brandColor ?? 'Inherited' },
        { label: 'Heading font', value: selected?.headingFont ?? 'Inter' },
        { label: 'Branded entities', value: `${state.entities.filter((entity) => entity.brandColor || entity.logoUrl).length} of ${state.entities.length}` },
      ];
    }
    default:
      return periodFacts;
  }
}
