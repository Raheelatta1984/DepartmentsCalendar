import React from 'react';
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  MapPin,
  Monitor,
  Presentation,
  Repeat,
  ShieldCheck,
  Timer,
  Users,
  XCircle,
  CircleDashed,
  CircleDot,
} from 'lucide-react';
import type { Activity, ActivityType, Priority, TaskStatus } from '../types';
import { Badge } from './ui';
import { useStore } from '../store';
import { TYPE_LABELS } from '../lib/analytics';
import { shortDate } from '../lib/dates';

export const TYPE_COLORS: Record<ActivityType, { bg: string; text: string; solid: string }> = {
  task: { bg: 'bg-blue-50', text: 'text-blue-700', solid: '#3b82f6' },
  follow_up: { bg: 'bg-amber-50', text: 'text-amber-700', solid: '#f59e0b' },
  appointment: { bg: 'bg-violet-50', text: 'text-violet-700', solid: '#8b5cf6' },
  meeting: { bg: 'bg-cyan-50', text: 'text-cyan-700', solid: '#06b6d4' },
  seminar: { bg: 'bg-pink-50', text: 'text-pink-700', solid: '#ec4899' },
  session: { bg: 'bg-indigo-50', text: 'text-indigo-700', solid: '#6366f1' },
  training: { bg: 'bg-teal-50', text: 'text-teal-700', solid: '#14b8a6' },
  audit: { bg: 'bg-rose-50', text: 'text-rose-700', solid: '#f43f5e' },
  site_visit: { bg: 'bg-lime-50', text: 'text-lime-700', solid: '#84cc16' },
};

export function TypeIcon({ type, className = 'h-3.5 w-3.5' }: { type: ActivityType; className?: string }) {
  switch (type) {
    case 'task':
      return <ClipboardCheck className={className} />;
    case 'follow_up':
      return <Repeat className={className} />;
    case 'appointment':
      return <CalendarClock className={className} />;
    case 'meeting':
      return <Users className={className} />;
    case 'seminar':
      return <Presentation className={className} />;
    case 'session':
      return <Monitor className={className} />;
    case 'training':
      return <GraduationCap className={className} />;
    case 'audit':
      return <ShieldCheck className={className} />;
    case 'site_visit':
      return <MapPin className={className} />;
    default:
      return <CalendarDays className={className} />;
  }
}

export const STATUS_META: Record<TaskStatus, { label: string; tone: string; icon: React.ReactNode }> = {
  not_started: { label: 'Not started', tone: 'neutral', icon: <CircleDashed className="h-3 w-3" /> },
  in_progress: { label: 'In progress', tone: 'info', icon: <CircleDot className="h-3 w-3" /> },
  blocked: { label: 'Blocked', tone: 'danger', icon: <XCircle className="h-3 w-3" /> },
  completed: { label: 'Completed', tone: 'good', icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: <XCircle className="h-3 w-3" /> },
};

export const PRIORITY_META: Record<Priority, { label: string; tone: string }> = {
  critical: { label: 'Critical', tone: 'danger' },
  high: { label: 'High', tone: 'warn' },
  medium: { label: 'Medium', tone: 'info' },
  low: { label: 'Low', tone: 'neutral' },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone}>
      {meta.icon}
      {meta.label}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function TypeBadge({ type }: { type: ActivityType }) {
  const c = TYPE_COLORS[type];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${c.bg} ${c.text}`}>
      <TypeIcon type={type} className="h-3 w-3" />
      {TYPE_LABELS[type]}
    </span>
  );
}

export function SyncPips({ activity }: { activity: Activity }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        title={activity.sync.outlook ? 'Synced to Outlook' : 'Not synced to Outlook'}
        className={`inline-flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold ${
          activity.sync.outlook ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-300'
        }`}
      >
        O
      </span>
      <span
        title={activity.sync.google ? 'Synced to Google Calendar' : 'Not synced to Google Calendar'}
        className={`inline-flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold ${
          activity.sync.google ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-300'
        }`}
      >
        G
      </span>
    </span>
  );
}

export function ActivityLine({
  activity,
  employeeName,
  departmentCode,
  departmentColor,
  onOpen,
  showDate = true,
  compact = false,
}: {
  activity: Activity;
  employeeName?: string;
  departmentCode?: string;
  departmentColor?: string;
  onOpen?: () => void;
  showDate?: boolean;
  compact?: boolean;
}) {
  const { state } = useStore();
  const workItem = state.workItems.find((i) => i.id === activity.workItemId);
  const overdue = activity.status !== 'completed' && activity.status !== 'cancelled' && activity.endDate < new Date().toISOString().slice(0, 10);
  return (
    <button
      onClick={onOpen}
      className={`group flex w-full items-start gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-slate-200 hover:bg-slate-50 ${
        compact ? 'py-1.5' : ''
      }`}
    >
      <span
        className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md"
        style={{ background: `${departmentColor ?? '#3b82f6'}18`, color: departmentColor ?? '#3b82f6' }}
      >
        <TypeIcon type={activity.type} className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-slate-800 group-hover:text-brand-700">{activity.title}</span>
          {activity.priority === 'critical' ? <Badge tone="danger">critical</Badge> : null}
          {overdue ? <Badge tone="danger">overdue</Badge> : null}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
          {showDate ? (
            <span className="flex items-center gap-0.5">
              <CalendarDays className="h-2.5 w-2.5" />
              {shortDate(activity.startDate)}
              {activity.endDate !== activity.startDate ? ` → ${shortDate(activity.endDate)}` : ''}
            </span>
          ) : null}
          {activity.startTime ? (
            <span className="flex items-center gap-0.5">
              <Timer className="h-2.5 w-2.5" />
              {activity.startTime}–{activity.endTime}
            </span>
          ) : null}
          <span>{activity.plannedHours}h planned</span>
          {workItem ? <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700">{workItem.kind}{workItem.externalId ? ` #${workItem.externalId}` : ''} · {workItem.title}</span> : null}
          {employeeName ? <span>· {employeeName}</span> : null}
          {departmentCode ? <span>· {departmentCode}</span> : null}
        </span>
      </span>
      <span className="flex flex-none flex-col items-end gap-1">
        <StatusBadge status={activity.status} />
        <SyncPips activity={activity} />
      </span>
    </button>
  );
}
