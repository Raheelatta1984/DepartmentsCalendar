import { jsPDF } from 'jspdf';
import type { DemoModel } from './demo-content';

/* ------------------------------------------------------------------ */
/* App demo — shareable PDF                                            */
/*                                                                     */
/* A marketing-style PDF of the store-listing demo: branded cover,     */
/* stats, one page per "screenshot" (drawn as a mini phone panel with  */
/* the live caption + bullets) and a features page. Same DemoModel as  */
/* the screen, so the PDF always matches what was on screen.          */
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

  /* ---- One page per screenshot ---- */
  model.screenshots.forEach((shot, index) => {
    doc.addPage();
    // mini phone panel on the left
    const px = 20;
    const py = 24;
    const pw = 62;
    const ph = 120;
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(1.6);
    doc.roundedRect(px, py, pw, ph, 8, 8, 'S');
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(px + pw / 2 - 10, py + 2.5, 20, 3, 1.5, 1.5, 'F');
    doc.setFillColor(...brand);
    doc.rect(px + 3, py + 9, pw - 6, 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(shot.title, px + 5, py + 17);
    // fake UI rows
    let ry = py + 26;
    doc.setFont('helvetica', 'normal');
    shot.points.forEach((p) => {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(px + 3, ry, pw - 6, 10, 1.5, 1.5, 'F');
      doc.setFontSize(5.5);
      doc.setTextColor(...INK);
      doc.text(wrap(doc, p, pw - 10).slice(0, 2), px + 5, ry + 4);
      ry += 12;
    });
    // content on the right
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text(shot.title, 95, 30);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(wrap(doc, shot.caption, 95), 95, 38);
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    bullets(doc, shot.points, 95, 48, 95, 5.5);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${model.appName} · screen ${index + 1} of ${model.screenshots.length}`, 20, H - 10);
  });

  /* ---- Features page ---- */
  doc.addPage();
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
      doc.addPage();
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
