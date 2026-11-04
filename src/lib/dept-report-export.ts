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

/**
 * The AI prompt copied to the clipboard when the PPTX is exported and shown
 * on the deck's first slide. Paste it into Copilot inside PowerPoint and it
 * reformats every slide into the status-pack design (colors included).
 */
export const COPILOT_REFORMAT_PROMPT = [
  'Reformat this entire deck into a polished weekly "Department status pack" design, keeping all existing text and data.',
  'Slide 1 stays a title slide: large title "Department status pack", tenant name, department count and generation date.',
  'Every department slide must follow this layout: a header band with the department name and code plus "Update <date> | Action tracker <date>"; a 4-card KPI strip with colored cards (Executive status card filled green/amber/red to match the RAG, Feeling, Workload, Support need); then three columns for "Immediate priority clusters", "Delivered outcomes" and "Key milestones" (milestones as date chips "d MMM — label"); then a bottom band with "Critical risks and dependencies" on a light red background and "Governance commitments" beside it.',
  'Use a clean sans-serif font, dark slate text (#1E293B), muted grey secondary text (#64748B), blue section headings (#2563EB), white page background, rounded cards with subtle borders, and generous spacing. Keep one department per slide, preserve the RAG colors exactly (green #22C55E, amber #F59E0B, red #EF4444), and make sure all bullet text fits on the slide without overflow.',
].join('\n\n');

/** Copy the Copilot prompt so it is on the clipboard the moment the PPTX opens. */
export async function copyCopilotPrompt(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(COPILOT_REFORMAT_PROMPT);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = COPILOT_REFORMAT_PROMPT;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

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

  // Copilot slide: the prompt is on the clipboard already (copied on export),
  // so opening the file goes straight to Copilot → paste → action.
  const copilot = pptx.addSlide();
  copilot.addText('✨ Reformat this deck with Copilot', { x: 0.6, y: 0.5, w: 8.8, h: 0.6, bold: true, fontSize: 24, color: ACCENT });
  copilot.addText('The AI prompt below is already on your clipboard (copied when you exported). In PowerPoint open Copilot, paste, and run — every slide is reformatted into the status-pack design with colors.', {
    x: 0.6, y: 1.15, w: 8.8, h: 0.7, fontSize: 12, color: MUTED,
  });
  copilot.addText(
    COPILOT_REFORMAT_PROMPT.split('\n\n').map((para) => ({ text: para, options: { fontSize: 11, color: INK, breakLine: true } })),
    { x: 0.6, y: 1.95, w: 8.8, h: 4.6, valign: 'top', fill: { color: 'F1F5F9' } },
  );

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
  // Copy the Copilot prompt first, so the moment the file opens the prompt
  // is ready to paste into Copilot and reformat the whole deck.
  await copyCopilotPrompt();
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
