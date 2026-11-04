import PptxGenJS from 'pptxgenjs';
import type { DeptReportModel } from './dept-report';
import { downloadCSV } from './export';

/* ------------------------------------------------------------------ */
/* Department status pack — exports                                    */
/*   · PPTX: one title slide + one slide per department, laid out like  */
/*     the weekly status-pack attachment                               */
/*   · CSV: flat export of every section for downstream tooling        */
/*   · PDF: handled by the page via window.print() + print CSS        */
/* ------------------------------------------------------------------ */

const RAG_COLOR: Record<string, string> = { green: '22C55E', amber: 'F59E0B', red: 'EF4444' };
const INK = '1E293B';
const MUTED = '64748B';
const ACCENT = '2563EB';

function addSection(slide: PptxGenJS.Slide, title: string, lines: string[], x: number, y: number, w: number, h: number) {
  slide.addText(title, { x, y, w, h: 0.3, bold: true, fontSize: 13, color: ACCENT });
  if (!lines.length) {
    slide.addText('—', { x, y: y + 0.32, w, h: h - 0.32, fontSize: 10, color: MUTED });
    return;
  }
  slide.addText(
    lines.map((line) => ({ text: `• ${line}`, options: { fontSize: 10, color: INK, breakLine: true } })),
    { x, y: y + 0.32, w, h: h - 0.32, valign: 'top' },
  );
}

export function buildReportDeck(reports: DeptReportModel[], tenantName: string): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.author = tenantName;
  pptx.title = 'Department status pack';

  const title = pptx.addSlide();
  title.addText('Department status pack', { x: 0.6, y: 2.2, w: 8.8, h: 1, bold: true, fontSize: 36, color: INK });
  title.addText(`${tenantName} · ${reports.length} department${reports.length === 1 ? '' : 's'} · generated ${new Date().toLocaleDateString('en-AU')}`, {
    x: 0.6, y: 3.3, w: 8.8, h: 0.5, fontSize: 14, color: MUTED,
  });

  for (const report of reports) {
    const slide = pptx.addSlide();
    slide.addText(`${report.name} (${report.code})`, { x: 0.4, y: 0.25, w: 9.2, h: 0.5, bold: true, fontSize: 22, color: INK });
    slide.addText(`Update ${report.updateDate}  |  Action tracker ${report.actionTrackerDate}  ·  ${report.periodLabel}`, {
      x: 0.4, y: 0.75, w: 9.2, h: 0.3, fontSize: 11, color: MUTED,
    });
    // KPI strip
    const kpis = [
      { label: 'Executive status', value: `${report.ragLabel} — ${report.ragHint} (score ${report.score})`, color: RAG_COLOR[report.rag] },
      { label: 'Feeling', value: report.feelingLabel, color: INK },
      { label: 'Workload', value: `${report.workloadLabel} (${Math.round(report.utilization)}%)`, color: INK },
      { label: 'Support need', value: report.supportNeed, color: INK },
    ];
    kpis.forEach((kpi, index) => {
      const x = 0.4 + index * 2.4;
      slide.addText(kpi.label.toUpperCase(), { x, y: 1.15, w: 2.2, h: 0.25, fontSize: 9, color: MUTED, bold: true });
      slide.addText(kpi.value, { x, y: 1.4, w: 2.2, h: 0.6, fontSize: 11, bold: true, color: kpi.color });
    });
    addSection(slide, `Immediate priority clusters · ${report.periodLabel}`, report.priorities.map((p) => `${p.title} — ${p.detail}`), 0.4, 2.1, 4.6, 2.2);
    addSection(slide, 'Delivered outcomes', report.outcomes, 5.2, 2.1, 4.4, 2.2);
    addSection(slide, 'Key milestones', report.milestones.map((m) => `${m.date} — ${m.label}`), 0.4, 4.4, 4.6, 2.4);
    addSection(slide, 'Critical risks and dependencies', report.risks, 5.2, 4.4, 4.4, 2.4);
    addSection(slide, 'Governance commitments', report.governance, 0.4, 6.9, 9.2, 0.5);
  }
  return pptx;
}

export async function exportReportPPTX(reports: DeptReportModel[], tenantName: string, filename = 'department-status-pack.pptx') {
  const pptx = buildReportDeck(reports, tenantName);
  await pptx.writeFile({ fileName: filename });
}

export function exportReportCSV(reports: DeptReportModel[], filename = 'department-status-pack.csv') {
  const rows: (string | number)[][] = [
    ['Department', 'Code', 'Period', 'RAG', 'Score', 'Feeling', 'Workload', 'Utilisation %', 'Support need', 'Headcount', 'Open activities', 'Overdue', 'Planned hours', 'Logged hours'],
    ...reports.map((r) => [r.name, r.code, r.periodLabel, `${r.ragLabel} — ${r.ragHint}`, r.score, r.feelingLabel, r.workloadLabel, Math.round(r.utilization), r.supportNeed, r.headcount, r.openActivities, r.overdueActivities, r.plannedHours, r.loggedHours]),
    [],
    ['Department', 'Section', 'Item', 'Detail'],
    ...reports.flatMap((r) => [
      ...r.priorities.map((p) => [r.name, 'Priority', p.title, p.detail]),
      ...r.outcomes.map((o) => [r.name, 'Outcome', o, '']),
      ...r.milestones.map((m) => [r.name, 'Milestone', m.date, m.label]),
      ...r.risks.map((risk) => [r.name, 'Risk', risk, '']),
      ...r.governance.map((g) => [r.name, 'Governance', g, '']),
    ]),
  ];
  downloadCSV(rows, filename);
}
