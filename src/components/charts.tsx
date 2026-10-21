import React, { useMemo, useState } from 'react';

/* ------------------------------------------------------------------ */
/* Sparkline                                                          */
/* ------------------------------------------------------------------ */
export function Sparkline({
  data,
  color = '#3a63f0',
  height = 34,
  fill = true,
  strokeWidth = 1.8,
}: {
  data: number[];
  color?: string;
  height?: number;
  fill?: boolean;
  strokeWidth?: number;
}) {
  const width = 120;
  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2, 7)}`, []);
  if (data.length < 2) return <div style={{ height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - 3 - ((v - min) / span) * (height - 6);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.24" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill ? <path d={area} fill={`url(#${id})`} /> : null}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Line chart with hover                                               */
/* ------------------------------------------------------------------ */
export interface Series {
  label: string;
  color: string;
  data: number[];
  dashed?: boolean;
}

export function LineChart({
  labels,
  series,
  height = 190,
  yMax,
  yMin = 0,
  suffix = '',
  showLegend = true,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  yMax?: number;
  yMin?: number;
  suffix?: string;
  showLegend?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 640;
  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = 24;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const all = series.flatMap((s) => s.data);
  const max = yMax ?? Math.max(100, Math.ceil(Math.max(...all, 1) / 10) * 10);
  const min = yMin;
  const span = max - min || 1;
  const x = (i: number) => padL + (labels.length === 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((v - min) / span) * innerH;
  const ticks = 4;

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${w} ${height}`}
          width="100%"
          height={height}
          role="img"
          onMouseLeave={() => setHover(null)}
        >
          {Array.from({ length: ticks + 1 }).map((_, i) => {
            const val = min + (span / ticks) * i;
            const yy = y(val);
            return (
              <g key={i}>
                <line x1={padL} x2={w - padR} y1={yy} y2={yy} stroke="#e2e8f0" strokeWidth="1" strokeDasharray={i === 0 ? '' : '3 4'} />
                <text x={padL - 6} y={yy + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                  {Math.round(val)}
                </text>
              </g>
            );
          })}
          {series.map((s) => {
            const path = s.data
              .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
              .join(' ');
            return (
              <g key={s.label}>
                <path
                  d={path}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                />
                {s.data.map((v, i) => (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r={hover === i ? 4 : 2.4}
                    fill="#fff"
                    stroke={s.color}
                    strokeWidth="1.8"
                  />
                ))}
              </g>
            );
          })}
          {labels.map((label, i) => (
            <g key={`${label}-${i}`}>
              <text x={x(i)} y={height - 6} textAnchor="middle" fontSize="9" fill="#94a3b8">
                {label}
              </text>
              <rect
                x={x(i) - innerW / (labels.length * 2)}
                y={padT}
                width={innerW / labels.length}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          ))}
          {hover !== null ? (
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
          ) : null}
        </svg>
        {hover !== null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[130px] rounded-lg border border-slate-200 bg-white/95 px-2.5 py-2 text-[11px] shadow-lg backdrop-blur"
            style={{
              left: `calc(${(x(hover) / w) * 100}% + 8px)`,
              transform: x(hover) > w * 0.7 ? 'translateX(-110%)' : undefined,
            }}
          >
            <div className="mb-1 font-semibold text-slate-700">{labels[hover]}</div>
            {series.map((s) => (
              <div key={s.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold tabular-nums text-slate-800">
                  {Math.round(s.data[hover] ?? 0)}
                  {suffix}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {showLegend ? (
        <div className="mt-1 flex flex-wrap items-center gap-3 pl-8">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bar list                                                */
/* ------------------------------------------------------------------ */
export function BarList({
  items,
  max,
  formatter = (v) => String(v),
  barHeight = 8,
  showValue = true,
}: {
  items: { label: string; value: number; color?: string; sublabel?: string; tone?: string }[];
  max?: number;
  formatter?: (v: number) => string;
  barHeight?: number;
  showValue?: boolean;
}) {
  const maxValue = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-medium text-slate-700">
              {item.label}
              {item.sublabel ? <span className="ml-1.5 text-[10px] font-normal text-slate-400">{item.sublabel}</span> : null}
            </span>
            {showValue ? <span className="flex-none text-[11px] font-semibold tabular-nums text-slate-500">{formatter(item.value)}</span> : null}
          </div>
          <div className="overflow-hidden rounded-full bg-slate-100" style={{ height: barHeight }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(2, Math.min(100, (item.value / maxValue) * 100))}%`,
                background: item.color ?? '#3a63f0',
              }}
            />
          </div>
        </div>
      ))}
      {items.length === 0 ? <div className="py-4 text-center text-xs text-slate-400">No data for this period</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Donut                                                              */
/* ------------------------------------------------------------------ */
export function Donut({
  segments,
  size = 150,
  thickness = 18,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-none" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
          {segments.map((s) => {
            const len = (s.value / total) * circumference;
            const dash = `${Math.max(0, len - 2)} ${circumference - Math.max(0, len - 2)}`;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="round"
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums text-slate-900">{centerValue}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400">{centerLabel}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {segments.slice(0, 7).map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 flex-none rounded-sm" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="flex-none font-semibold tabular-nums text-slate-500">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Score ring                                                         */
/* ------------------------------------------------------------------ */
export function ScoreRing({
  value,
  size = 56,
  stroke = 6,
  label,
  tone,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  tone?: string;
}) {
  const color = tone ?? (value >= 85 ? '#10b981' : value >= 70 ? '#f59e0b' : '#ef4444');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${c - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[13px] font-semibold tabular-nums leading-none text-slate-900">{value}</span>
        {label ? <span className="mt-0.5 text-[8px] uppercase tracking-wider text-slate-400">{label}</span> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked capacity bar                                               */
/* ------------------------------------------------------------------ */
export function StackedBar({
  segments,
  height = 10,
  rounded = true,
}: {
  segments: { value: number; color: string; label?: string }[];
  height?: number;
  rounded?: boolean;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className={`flex w-full overflow-hidden bg-slate-100 ${rounded ? 'rounded-full' : ''}`} style={{ height }}>
      {segments.map((s, i) => (
        <div
          key={i}
          title={s.label}
          style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          className="h-full transition-all"
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Heat calendar (workload per day)                                    */
/* ------------------------------------------------------------------ */
export function HeatGrid({
  cells,
  columns = 7,
  onSelect,
  selected,
  cellSize = 30,
  legend = true,
}: {
  cells: {
    iso: string;
    day: number;
    value: number;
    isWeekend: boolean;
    holiday?: { name: string } | null;
    entries: number;
  }[];
  columns?: number;
  onSelect?: (iso: string) => void;
  selected?: string | null;
  cellSize?: number;
  legend?: boolean;
}) {
  const max = Math.max(...cells.map((c) => c.value), 8);
  const color = (v: number) => {
    if (!v) return '#f8fafc';
    const ratio = Math.min(1, v / max);
    const alpha = 0.16 + ratio * 0.7;
    return `rgba(58, 99, 240, ${alpha.toFixed(2)})`;
  };
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {cells.map((c) => (
          <button
            key={c.iso}
            onClick={() => onSelect?.(c.iso)}
            title={`${c.iso} · ${c.value}h logged${c.holiday ? ` · ${c.holiday.name}` : ''}`}
            className={`group relative flex flex-col items-start justify-between rounded-md border p-1.5 text-left transition-all ${
              selected === c.iso ? 'ring-2 ring-brand-500 ring-offset-1' : 'hover:border-brand-300'
            } ${c.holiday ? 'border-rose-200' : c.isWeekend ? 'border-slate-100' : 'border-slate-200'}`}
            style={{ minHeight: cellSize, background: c.holiday ? '#fff1f2' : color(c.value) }}
          >
            <span className={`text-[10px] font-semibold ${c.value > max * 0.55 ? 'text-white' : 'text-slate-500'}`}>{c.day}</span>
            {c.value ? (
              <span className={`text-[9px] font-medium ${c.value > max * 0.55 ? 'text-white/90' : 'text-slate-500'}`}>
                {c.value}h
              </span>
            ) : null}
            {c.holiday ? (
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" title={c.holiday.name} />
            ) : null}
          </button>
        ))}
      </div>
      {legend ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-slate-200 bg-slate-50" /> no time logged
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'rgba(58,99,240,0.35)' }} /> low
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'rgba(58,99,240,0.85)' }} /> high
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> public holiday
          </span>
        </div>
      ) : null}
    </div>
  );
}
