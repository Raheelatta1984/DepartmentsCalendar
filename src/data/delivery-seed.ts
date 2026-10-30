import type { DeliveryStream, StoreState, WorkItem } from '../types';

/** Small, explicitly illustrative backlog: no extra actual hours are fabricated. */
export function withDeliverySample(state: StoreState): StoreState {
  const streams: DeliveryStream[] = [...(state.deliveryStreams ?? [])];
  const items: WorkItem[] = [...(state.workItems ?? [])];
  const employees = state.employees.map((e) => ({ ...e }));
  const activities = state.activities.map((a) => ({ ...a }));
  const now = new Date().toISOString();
  state.departments.filter((d) => d.devopsEnabled).forEach((dept) => {
    const prefix = `stream-${dept.id}`;
    const members = employees.filter((e) => e.departmentId === dept.id);
    const leads = members.filter((e) => ['supervisor', 'manager'].includes(e.role));
    const specs: [string, string, string | null][] = [
      ['architecture', 'Architecture', null], ['solution-architecture', 'Solution architecture', 'architecture'],
      ['d365', 'D365 & enterprise apps', null], ['data', 'Data & analytics', null],
      ['integration', 'Integration & APIs', null], ['cloud', 'Cloud & infrastructure', null],
      ['devops', 'DevOps & platform', 'cloud'], ['security', 'Cyber security', null],
    ];
    specs.forEach(([code, name, parent], i) => {
      if (!streams.some((s) => s.id === `${prefix}-${code}`)) streams.push({ id: `${prefix}-${code}`, departmentId: dept.id, parentId: parent ? `${prefix}-${parent}` : null, name, code: code.toUpperCase().replace(/-/g, '-'), leadId: leads[i % Math.max(1, leads.length)]?.id ?? dept.headId, color: ['#6366f1', '#8b5cf6', '#0ea5e9', '#14b8a6', '#f59e0b', '#06b6d4', '#3b82f6', '#ec4899'][i] });
    });
    const deliveryStreams = streams.filter((s) => s.departmentId === dept.id);
    const leafStreams = deliveryStreams.filter((s) => !deliveryStreams.some((child) => child.parentId === s.id));
    members.forEach((e, i) => { e.streamId ??= leafStreams[i % leafStreams.length]?.id; });
    if (dept.code !== 'RIT') return;
    const projects = state.projects.filter((p) => p.departmentId === dept.id && p.tasks.length >= 4).slice(0, 3);
    projects.forEach((project, pi) => {
      const epicId = `demo-epic-${pi + 1}`;
      if (items.some((i) => i.id === epicId)) return;
      const base = { departmentId: dept.id, projectId: project.id, assigneeId: project.managerId, funding: project.portfolio === 'capital' ? 'capex' as const : 'opex' as const, source: 'manual' as const, externalId: '', externalUrl: '', organization: '', devopsProject: '', createdAt: now, updatedAt: now };
      items.push({ ...base, id: epicId, kind: 'epic', title: project.name, description: 'Illustrative epic linked to the seeded project. Replace with your own Azure DevOps export when ready.', parentId: null, streamId: deliveryStreams[pi]?.id ?? null, phase: 'design', status: 'in_progress', priority: 'high', estimateHours: 0 });
      ['Solution & experience', 'Build & rollout'].forEach((name, fi) => {
        const featureId = `${epicId}-feature-${fi + 1}`;
        items.push({ ...base, id: featureId, kind: 'feature', title: name, description: 'A feature groups the delivery tickets and rolls up their calendar plans and logged effort.', parentId: epicId, streamId: leafStreams[(pi * 2 + fi) % leafStreams.length]?.id ?? null, phase: fi ? 'build' : 'design', status: 'in_progress', priority: 'medium', estimateHours: 0 });
        project.tasks.slice(fi * 2, fi * 2 + 2).forEach((task, ti) => {
          const activity = activities.find((a) => a.id === task.activityId);
          const ticketId = `${featureId}-ticket-${ti + 1}`;
          items.push({ ...base, id: ticketId, kind: 'ticket', title: task.title, description: 'Sample ticket. Schedule work against it, then log time on the calendar activity.', parentId: featureId, streamId: employees.find((e) => e.id === activity?.assigneeId)?.streamId ?? null, assigneeId: activity?.assigneeId ?? project.managerId, phase: task.phase, status: activity?.status ?? 'not_started', priority: 'medium', estimateHours: task.plannedHours });
          if (activity) { activity.workItemId = ticketId; activity.streamId = employees.find((e) => e.id === activity.assigneeId)?.streamId; }
        });
      });
    });
  });
  return { ...state, deliveryStreams: streams, workItems: items, employees, activities };
}
