import type { Activity, Employee, StoreState, TimeEntry } from '../types';

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCSV(rows: (string | number)[][], filename: string) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n');
  download(`\uFEFF${csv}`, filename, 'text/csv;charset=utf-8;');
}

const ICS_DATE = (iso: string, time?: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!time) return `${iso.replace(/-/g, '')}`;
  const [hh, mm] = time.split(':').map(Number);
  return `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}00`;
};

const escapeICS = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/**
 * Builds a standards-compliant iCalendar feed. Importing it into Outlook or
 * Google Calendar produces the same events the Graph/Google connectors create.
 */
export function activitiesToICS(activities: Activity[], employees: Employee[], calendarName = 'Orbit activities') {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Orbit//Department Activity Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(calendarName)}`,
  ];
  activities.forEach((a) => {
    const emp = empMap.get(a.assigneeId);
    const allDay = !a.startTime;
    const endDate = allDay ? nextDay(a.endDate) : a.endDate;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.id}@orbit.local`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      allDay ? `DTSTART;VALUE=DATE:${ICS_DATE(a.startDate)}` : `DTSTART:${ICS_DATE(a.startDate, a.startTime)}`,
      allDay ? `DTEND;VALUE=DATE:${ICS_DATE(endDate)}` : `DTEND:${ICS_DATE(endDate, a.endTime ?? addHour(a.startTime ?? '09:00'))}`,
      `SUMMARY:${escapeICS(`[${a.type.replace('_', ' ')}] ${a.title}`)}`,
      `DESCRIPTION:${escapeICS(
        `${a.description}\n\nOwner: ${emp?.name ?? a.assigneeId}\nStatus: ${a.status} (${a.progress}%)\nPlanned: ${a.plannedHours}h\nPriority: ${a.priority}`,
      )}`,
      a.location ? `LOCATION:${escapeICS(a.location)}` : '',
      'STATUS:CONFIRMED',
      `CATEGORIES:${a.type.toUpperCase()}`,
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

export function downloadICS(activities: Activity[], employees: Employee[], filename = 'orbit-activities.ics') {
  download(activitiesToICS(activities, employees), filename, 'text/calendar;charset=utf-8;');
}

function nextDay(iso: string) {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function addHour(time: string) {
  const [h, m] = time.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeEntriesToCSV(entries: TimeEntry[], state: StoreState) {
  const emp = new Map(state.employees.map((e) => [e.id, e]));
  const act = new Map(state.activities.map((a) => [a.id, a]));
  const dept = new Map(state.departments.map((d) => [d.id, d]));
  return downloadCSV(
    [
      ['Date', 'Employee', 'Code', 'Department', 'Activity', 'Activity type', 'Hours', 'Billable', 'Approved', 'Note'],
      ...entries.map((t) => {
        const e = emp.get(t.employeeId);
        const a = act.get(t.activityId);
        return [
          t.date,
          e?.name ?? t.employeeId,
          e?.code ?? '',
          dept.get(e?.departmentId ?? '')?.name ?? '',
          a?.title ?? '',
          a?.type ?? '',
          t.hours,
          t.billable ? 'Yes' : 'No',
          t.approved ? 'Yes' : 'No',
          t.note,
        ];
      }),
    ],
    'orbit-timesheets.csv',
  );
}

export function activitiesToCSV(activities: Activity[], state: StoreState) {
  const emp = new Map(state.employees.map((e) => [e.id, e]));
  const dept = new Map(state.departments.map((d) => [d.id, d]));
  const entity = new Map(state.entities.map((e) => [e.id, e]));
  return downloadCSV(
    [
      ['ID', 'Title', 'Type', 'Entity', 'Department', 'Assignee', 'Start', 'End', 'Start time', 'End time', 'Planned hours', 'Status', 'Priority', 'Progress %', 'Outlook sync', 'Google sync', 'Subtasks'],
      ...activities.map((a) => [
        a.id,
        a.title,
        a.type,
        entity.get(a.entityId)?.name ?? '',
        dept.get(a.departmentId)?.name ?? '',
        emp.get(a.assigneeId)?.name ?? '',
        a.startDate,
        a.endDate,
        a.startTime ?? '',
        a.endTime ?? '',
        a.plannedHours,
        a.status,
        a.priority,
        a.progress,
        a.sync.outlook ? 'Yes' : 'No',
        a.sync.google ? 'Yes' : 'No',
        a.subtasks.map((s) => `${s.done ? '[x]' : '[ ]'} ${s.title} (${s.plannedHours}h)`).join(' | '),
      ]),
    ],
    'orbit-activity-register.csv',
  );
}

export function buildEscalationEmail(opts: {
  departmentName: string;
  periodLabel: string;
  score: number;
  threshold: number;
  utilization: number;
  onTimeRate: number;
  overdue: number;
  headName?: string;
  headEmail?: string;
  cooName?: string;
  cooEmail?: string;
  note?: string;
}) {
  const subject = `[Action required] ${opts.departmentName} performance below threshold — ${opts.periodLabel}`;
  const body = `Dear ${opts.headName ?? 'Department Head'},

The ${opts.departmentName} delivery score for ${opts.periodLabel} is ${opts.score}/100, below the group threshold of ${opts.threshold}.

Key indicators
• Utilization: ${opts.utilization}% of available capacity
• On-time delivery: ${opts.onTimeRate}%
• Overdue activities: ${opts.overdue}

${opts.note ? `Observations: ${opts.note}\n\n` : ''}Please review the department calendar, rebalance workload and respond with a recovery plan within two working days. The Head of Operations is copied as per group governance policy.

Regards,
PMO — Group Operations
Orbit activity portal`;
  return {
    subject,
    body,
    to: opts.headEmail ?? '',
    cc: opts.cooEmail ?? '',
  };
}
