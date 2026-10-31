import type { Activity, Employee, Escalation, FeelingOption, LeadershipUpdate, OneOnOneSession, StoreState, Tenant } from '../types';
import { orgChain, orgDescendantIds } from './org';
import { toISO } from './dates';

export const DEFAULT_FEELING_SCALE: FeelingOption[] = [
  { value: 1, label: 'Not happy', color: '#dc2626' },
  { value: 2, label: 'OK', color: '#f59e0b' },
  { value: 3, label: 'Good', color: '#3b82f6' },
  { value: 4, label: 'Excellent', color: '#10b981' },
  { value: 5, label: 'Thriving', color: '#7c3aed' },
];

export function feelingScale(tenant?: Tenant): FeelingOption[] {
  const custom = tenant?.feelingScale;
  return custom?.length === 5 && new Set(custom.map((row) => row.value)).size === 5
    ? [...custom].sort((a, b) => a.value - b.value)
    : DEFAULT_FEELING_SCALE;
}

/** Self, the direct reporting lead, and all downstream reports. Never peers or higher ancestors. */
export function standupVisibleIds(employees: Employee[], viewerId: string): Set<string> {
  const viewer = employees.find((row) => row.id === viewerId);
  if (!viewer) return new Set();
  const visible = orgDescendantIds(employees, viewerId);
  visible.add(viewerId);
  if (viewer.managerId && employees.some((row) => row.id === viewer.managerId)) visible.add(viewer.managerId);
  return visible;
}

/** Use for every personal-stand-up view, pulse and notification. Drafts stay with their author. */
export function standupStateForViewer(state: StoreState, viewerId: string): StoreState {
  const ids = standupVisibleIds(state.employees, viewerId);
  return {
    ...state,
    employees: state.employees.filter((employee) => ids.has(employee.id)),
    standups: state.standups.filter((entry) => ids.has(entry.employeeId) && (entry.status === 'submitted' || entry.employeeId === viewerId)),
  };
}

export function canPublishLeadershipUpdate(state: StoreState, authorId: string): boolean {
  const person = state.employees.find((employee) => employee.id === authorId);
  if (!person || person.status === 'inactive') return false;
  return state.departments.some((department) => department.headId === authorId)
    || state.deliveryStreams.some((stream) => stream.leadId === authorId)
    || ['department_head', 'unit_head', 'manager', 'supervisor'].includes(person.role)
    || (/\b(head|lead|pmo)\b/i.test(person.jobTitle ?? '') && orgDescendantIds(state.employees, authorId).size > 0);
}

export function canSeeLeadershipUpdate(state: StoreState, viewerId: string, update: LeadershipUpdate): boolean {
  return update.authorId === viewerId || orgDescendantIds(state.employees, update.authorId).has(viewerId);
}

/** New records are restricted to the reporter's reporting chain; legacy records to their named recipients. */
export function canViewEscalation(state: StoreState, viewerId: string, escalation: Escalation): boolean {
  if (escalation.raisedById) return orgChain(state.employees, escalation.raisedById).some((person) => person.id === viewerId);
  return escalation.recipients.includes(viewerId);
}

export function escalationChain(state: StoreState, escalation: Escalation): Employee[] {
  return escalation.raisedById ? orgChain(state.employees, escalation.raisedById) : [];
}

/** Participants can read notes; higher leaders see only an explicitly generated summary. */
export function canReadOneOnOneNotes(session: OneOnOneSession, viewerId: string): boolean {
  return viewerId === session.employeeId || viewerId === session.managerId;
}
export function canViewOneOnOne(state: StoreState, viewerId: string, session: OneOnOneSession): boolean {
  if (canReadOneOnOneNotes(session, viewerId)) return true;
  return Boolean(session.summary && session.summaryGeneratedAt)
    && orgChain(state.employees, session.managerId).some((person) => person.id === viewerId);
}

/** Generated escalation follow-ups bypass ordinary delegation but always target a chain member. */
export function escalationActivity(id: string, target: Employee, authorId: string, title: string, description: string, now: string): Activity {
  const date = toISO(new Date(now));
  return {
    id, title, description, type: 'follow_up', entityId: target.entityId, departmentId: target.departmentId,
    assigneeId: target.id, createdById: authorId, startDate: date, endDate: date,
    plannedHours: 0.25, status: 'not_started', priority: 'critical', progress: 0,
    subtasks: [], sync: { outlook: false, google: false }, createdAt: now,
  };
}
