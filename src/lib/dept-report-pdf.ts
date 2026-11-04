import { jsPDF } from 'jspdf';
import type { DeptReportModel } from './dept-report';

/* ------------------------------------------------------------------ */
/* Department status pack — real PDF export                            */
/*                                                                     */
/* Renders one A4-landscape page per department with the same colored   */
/* layout as the on-screen section: header band, RAG/feeling/workload  */
/* KPI cards, priority clusters, outcomes, milestones, risks and       */
/* governance. Colors are preserved in the PDF, unlike a page print.   */
/* ------------------------------------------------------------------ */

const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const ACCENT: [number, number, number] = [37, 99, 235];
const RAG_FILL: Record<string, [number, number, number]> = {
  green: [220, 252, 231],
  amber: [254, 243, 199],
  red: [254, 226, 226],
};
const RAG_TEXT: Record<string, [number, number, number]> = {
  green: [21, 128, 61],
  amber: [180, 83, 9],
  red: [185, 28, 28],
};
const RAG_DOT: Record<string, [number, number, number]> = {
  green: [34, 197, 94],
  amber: [245, 158, 11],
  red: [239, 68, 68],
};
const CARD_FILL: [number, number, number] = [248, 250, 252];
const RISK_FILL: [number, number, number] = [254, 242, 242];
const OUTCOME_FILL: [number, number, number] = [236, 253, 245];

function wrap(doc: jsPDF, text: string, width: number): string[] {
  return doc.splitTextToSize(text, width) as string[];
}

function drawBullets(doc: jsPDF, lines: string[], x: number, y: number, w: number, lineHeight = 4.6, maxLines = 12): number {
  let cursor = y;
  const maxY = 200;
  for (const line of lines.slice(0, maxLines)) {
    if (cursor > maxY) break;
    const wrapped = wrap(doc, `•  ${line}`, w);
    for (const row of wrapped) {
      if (cursor > maxY) break;
      doc.text(row, x, cursor);
      cursor += lineHeight;
    }
  }
  return cursor;
}

function sectionTitle(doc: jsPDF, title: string, x: number, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text(title, x, y);
}

export function buildReportPDF(reports: DeptReportModel[], tenantName: string): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = 297;
  const H = 210;

  // Title page
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.text('Department status pack', 20, 90);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...MUTED);
  doc.text(`${tenantName} · ${reports.length} department${reports.length === 1 ? '' : 's'} · generated ${new Date().toLocaleDateString('en-AU')}`, 20, 102);

  reports.forEach((report, index) => {
    doc.addPage();
    // Header band
    doc.setFillColor(248, 250, 252);
    doc.rect(0, 0, W, 26, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...INK);
    doc.text(`${report.name} (${report.code}) · status pack`, 12, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(`Update ${report.updateDate}   |   Action tracker ${report.actionTrackerDate}   ·   ${report.periodLabel}`, 12, 18);
    doc.setFontSize(8);
    doc.text(`${report.periodLabel}`, W - 12, 18, { align: 'right' });

    // KPI cards
    const kpiY = 30;
    const kpiW = (W - 24 - 3 * 4) / 4;
    const kpis = [
      { label: 'EXECUTIVE STATUS', value: `${report.ragLabel} — ${report.ragHint}`, sub: `score ${report.score}`, fill: RAG_FILL[report.rag], textColor: RAG_TEXT[report.rag], dot: RAG_DOT[report.rag] },
      { label: 'FEELING', value: report.feelingLabel, sub: report.feeling != null ? `avg ${report.feeling}/5` : 'no check-ins', fill: CARD_FILL, textColor: INK, dot: null },
      { label: 'WORKLOAD', value: `${report.workloadLabel} · ${Math.round(report.utilization)}%`, sub: `${report.loggedHours}h logged / ${report.plannedHours}h planned`, fill: CARD_FILL, textColor: INK, dot: null },
      { label: 'SUPPORT NEED', value: report.supportNeed, sub: '', fill: CARD_FILL, textColor: INK, dot: null },
    ];
    kpis.forEach((kpi, i) => {
      const x = 12 + i * (kpiW + 4);
      doc.setFillColor(...kpi.fill);
      doc.roundedRect(x, kpiY, kpiW, 22, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(kpi.label, x + 3, kpiY + 5);
      if (kpi.dot) {
        doc.setFillColor(...kpi.dot);
        doc.circle(x + 5, kpiY + 10.5, 2, 'F');
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...kpi.textColor);
      const valueLines = wrap(doc, kpi.value, kpiW - 8);
      doc.text(valueLines.slice(0, 2), x + (kpi.dot ? 9 : 3), kpiY + (valueLines.length > 1 ? 9.5 : 11.5));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      if (kpi.sub) doc.text(wrap(doc, kpi.sub, kpiW - 6).slice(0, 1), x + 3, kpiY + 19);
    });

    // Three columns: priorities / outcomes / milestones
    const colY = 60;
    const colW = (W - 24 - 2 * 6) / 3;
    sectionTitle(doc, `Immediate priority clusters · ${report.periodLabel}`, 12, colY);
    sectionTitle(doc, 'Delivered outcomes', 12 + colW + 6, colY);
    sectionTitle(doc, 'Key milestones', 12 + 2 * (colW + 6), colY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    drawBullets(doc, report.priorities.map((p) => `${p.title} — ${p.detail}`), 12, colY + 6, colW, 4.2, 8);
    drawBullets(doc, report.outcomes.length ? report.outcomes : ['—'], 12 + colW + 6, colY + 6, colW, 4.2, 8);
    drawBullets(doc, report.milestones.length ? report.milestones.map((m) => `${m.date} — ${m.label}`) : ['—'], 12 + 2 * (colW + 6), colY + 6, colW, 4.2, 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`${report.headcount} people · ${report.openActivities} open · ${report.overdueActivities} overdue · ${report.plannedHours}h planned · ${report.loggedHours}h logged`, 12, colY + 46);

    // Risks + governance band
    const bandY = 112;
    doc.setFillColor(...RISK_FILL);
    doc.rect(0, bandY, W, H - bandY, 'F');
    sectionTitle(doc, 'Critical risks and dependencies', 12, bandY + 7);
    sectionTitle(doc, 'Governance commitments', 12 + colW + 6, bandY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(153, 27, 27);
    drawBullets(doc, report.risks.length ? report.risks : ['No open risks.'], 12, bandY + 13, colW * 1.6, 4.4, 10);
    doc.setTextColor(...INK);
    drawBullets(doc, report.governance, 12 + colW + 6, bandY + 13, W - 24 - colW - 6, 4.4, 8);

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`${tenantName} · ${report.name} · page ${index + 2} of ${reports.length + 1}`, 12, H - 6);
  });

  return doc;
}

export function exportReportPDF(reports: DeptReportModel[], tenantName: string, filename = 'department-status-pack.pdf') {
  const doc = buildReportPDF(reports, tenantName);
  doc.save(filename);
}
