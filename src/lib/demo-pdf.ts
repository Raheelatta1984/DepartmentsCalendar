import { jsPDF } from 'jspdf';
import type { DemoModel } from './demo-content';

/* ------------------------------------------------------------------ */
/* App demo — shareable PDF                                            */
/*                                                                     */
/* A marketing-style PDF of the store-listing demo: branded cover,     */
/* then per tab a full-screen landscape page (the 20" 16:9 monitor    */
/* frame fills the whole A4 landscape page; continuation pages when    */
/* the screen content overflows) followed by                         */
/* a dedicated brief page (guide note, live points, purpose / impact  */
/* / outcome and industry examples), and a features page. Same        */
/* DemoModel as the screen, so the PDF always matches what was shown.  */
/* ------------------------------------------------------------------ */

const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function wrap(doc: jsPDF, text: string, width: number): string[] {
  return doc.splitTextToSize(text, width) as string[];
}

function bullets(doc: jsPDF, lines: string[], x: number, y: number, w: number, lineHeight = 5, maxLines = 20): number {
  let cursor = y;
  for (const line of lines.slice(0, maxLines)) {
    for (const row of wrap(doc, `•  ${line}`, w)) {
      doc.text(row, x, cursor);
      cursor += lineHeight;
    }
  }
  return cursor;
}

export function buildDemoPDF(model: DemoModel): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const H = 297;
  const brand = hexToRgb(model.brandColor);

  /* ---- Cover ---- */
  doc.setFillColor(...brand);
  doc.rect(0, 0, W, 78, 'F');
  // app icon
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(20, 22, 26, 26, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...brand);
  doc.text('O', 30, 41);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.text(model.appName, 52, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(wrap(doc, model.tagline, 140), 52, 42);
  // rating
  doc.setFontSize(12);
  doc.setTextColor(255, 235, 150);
  doc.text(`${'★'.repeat(Math.round(model.rating))}${'☆'.repeat(5 - Math.round(model.rating))}  ${model.rating.toFixed(1)}`, 52, 54);
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(`${model.reviews} · tenant: ${model.tenantName} · entity: ${model.entityName}`, 52, 61);
  // stats strip
  const statW = (W - 40 - 3 * 4) / 4;
  model.stats.forEach((s, i) => {
    const x = 20 + i * (statW + 4);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, 88, statW, 20, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...brand);
    doc.text(s.value, x + 3, 98);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(s.label.toUpperCase(), x + 3, 104);
  });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...INK);
  doc.text('Screenshots', 20, 124);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text('Live from the workspace for the selected tenant & entity — not stock images.', 20, 130);
  doc.setFontSize(8);
  doc.text(`Generated ${new Date().toLocaleDateString('en-AU')} · share this PDF with the wider audience`, 20, H - 10);

  /* ---- Per tab: full-screen landscape page(s), then a brief page ---- */
  const LW = 297; // A4 landscape — the screen fills the whole page
  const LH = 210;
  const frameX = 10;
  const frameY = 16;
  const frameW = LW - 20; // 277mm-wide 20" 16:9 monitor frame
  const frameH = Math.round((frameW * 9) / 16);
  const rowH = 11;
  const rowsPerPage = Math.max(1, Math.floor((frameH - 52) / rowH));

  const drawScreenFrame = (shot: DemoModel['screenshots'][number], rows: string[], suffix: string, footer: string) => {
    doc.addPage('a4', 'landscape');
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(1.6);
    doc.roundedRect(frameX, frameY, frameW, frameH, 4, 4, 'S');
    doc.setFillColor(15, 23, 42);
    doc.rect(frameX + frameW / 2 - 9, frameY + frameH, 18, 4, 'F'); // monitor stand
    doc.rect(frameX + frameW / 2 - 20, frameY + frameH + 4, 40, 2, 'F');
    // in-screen brand header
    doc.setFillColor(...brand);
    doc.rect(frameX + 2.5, frameY + 3, frameW - 5, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`${shot.title}${suffix}`, frameX + 6, frameY + 10);
    // AI guide sticky note inside the real screen
    let ry = frameY + 16;
    doc.setFillColor(246, 230, 162);
    doc.roundedRect(frameX + 3, ry, frameW - 6, 30, 1.5, 1.5, 'F');
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(frameX + 8, ry - 3, 18, 4.5, 1, 1, 'F');
    doc.setFillColor(34, 32, 15);
    doc.roundedRect(frameX + 7, ry + 3, 15, 5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(247, 236, 198);
    doc.text('GUIDE', frameX + 8.5, ry + 6.4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(47, 44, 24);
    doc.text(wrap(doc, shot.guide.title, frameW - 46).slice(0, 1), frameX + 28, ry + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(87, 82, 47);
    doc.text(wrap(doc, `Do this: ${shot.guide.tip}`, frameW - 14).slice(0, 4), frameX + 7, ry + 13);
    ry += 35;
    // content rows inside the frame
    doc.setFont('helvetica', 'normal');
    for (const p of rows) {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(frameX + 3, ry, frameW - 6, rowH - 1.5, 1.5, 1.5, 'F');
      doc.setFontSize(7.5);
      doc.setTextColor(...INK);
      doc.text(wrap(doc, p, frameW - 14).slice(0, 2), frameX + 7, ry + 5);
      ry += rowH;
    }
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(footer, 20, LH - 8);
  };

  model.screenshots.forEach((shot, index) => {
    const label = `${model.appName} · screen ${index + 1} of ${model.screenshots.length}`;
    // 1) full screen — as many rows as fit, continuation pages for the rest
    const pages = Math.max(1, Math.ceil(shot.points.length / rowsPerPage));
    for (let p = 0; p < pages; p++) {
      const rows = shot.points.slice(p * rowsPerPage, (p + 1) * rowsPerPage);
      const suffix = pages > 1 ? (p === 0 ? ' (1/2)' : ' (continued)') : '';
      const footer = pages > 1 ? `${label} · screen page ${p + 1}/${pages}` : `${label} · full screen`;
      drawScreenFrame(shot, rows, suffix, footer);
    }

    // 2) brief page — caption, sticky note, live points, purpose/impact/outcome, industries
    doc.addPage('a4', 'portrait');
    let by = 26;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.setTextColor(...INK);
    doc.text(`${shot.title} — brief`, 20, by);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    by = bullets(doc, [shot.caption], 20, by + 6, 170, 5) + 4;
    // sticky-note summary
    doc.setFillColor(246, 230, 162);
    doc.roundedRect(20, by, 170, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(47, 44, 24);
    doc.text(`AI GUIDE — ${shot.guide.title}`, 23, by + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(87, 82, 47);
    doc.text(wrap(doc, `Do this: ${shot.guide.tip}`, 164).slice(0, 2), 23, by + 10.5);
    by += 22;
    // live data points
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text('On this screen right now', 20, by);
    by += 6;
    by = bullets(doc, shot.points, 20, by, 170, 4.8, 40);
    by += 5;
    // AI-generated brief: purpose / impact / outcome / industry examples
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...brand);
    doc.text('AI BRIEF', 20, by);
    by += 7;
    const ensure = (need: number) => {
      if (by + need > H - 16) {
        doc.addPage('a4', 'portrait');
        by = 24;
      }
    };
    const briefRows: [string, string][] = [
      ['Purpose', shot.brief.purpose],
      ['Impact', shot.brief.impact],
      ['Outcome', shot.brief.outcome],
    ];
    for (const [label, text] of briefRows) {
      ensure(16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      doc.text(label, 20, by);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      by = bullets(doc, [text], 42, by, 148, 4.6, 6) + 2;
    }
    ensure(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    doc.text('By industry', 20, by);
    by += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    for (const ex of shot.brief.examples) {
      ensure(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...INK);
      doc.text(`${ex.industry}:`, 20, by);
      const labelW = doc.getTextWidth(`${ex.industry}: `) + 1.5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      by = bullets(doc, [ex.example], 20 + labelW, by, 170 - labelW, 4.4, 4) + 1.5;
    }
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${label} · brief`, 20, H - 10);
  });

  /* ---- Features page ---- */
  doc.addPage('a4', 'portrait');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...INK);
  doc.text('Why every company needs it', 20, 26);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`${model.tenantName} · ${model.entityName} — ${new Date().toLocaleDateString('en-AU')}`, 20, 33);
  let y = 44;
  model.features.forEach((f, i) => {
    doc.setFillColor(...brand);
    doc.circle(22, y - 1.5, 2.2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(f.title, 28, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    y = bullets(doc, [f.detail], 28, y + 5, 160, 4.8) + 5;
    if (y > H - 30 && i < model.features.length - 1) {
      doc.addPage('a4', 'portrait');
      y = 24;
    }
  });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...brand);
  doc.text('Try it with your own company', 20, Math.min(y + 4, H - 24));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  bullets(doc, model.highlights, 20, Math.min(y + 10, H - 18), 170, 4.8);

  return doc;
}

export function exportDemoPDF(model: DemoModel, filename = 'app-demo.pdf') {
  buildDemoPDF(model).save(filename);
}
