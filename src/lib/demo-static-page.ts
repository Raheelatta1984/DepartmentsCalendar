import type { DemoModel } from './demo-content';

/* ------------------------------------------------------------------ */
/* App demo — shareable static page                                    */
/*                                                                     */
/* Builds a fully self-contained HTML file (inline CSS, no external     */
/* assets, works from file:// or any static host) carrying the whole   */
/* demo: brand, stats, and for every tab the caption, AI guide note,   */
/* live data points and the AI brief (purpose / impact / outcome /     */
/* industry examples). The top of the page links to the live app demo  */
/* (shareable deep link) where the pixel-perfect screens and the       */
/* voiced video tour run. Same DemoModel as the screen and the PDF.     */
/* ------------------------------------------------------------------ */

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function demoShareUrl(tenantId: string, entityId: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/demo?tenant=${encodeURIComponent(tenantId)}&entity=${encodeURIComponent(entityId)}`;
}

export function buildDemoStaticPage(model: DemoModel, shareUrl: string): string {
  const brand = model.brandColor;
  const stars = `${'★'.repeat(Math.round(model.rating))}${'☆'.repeat(5 - Math.round(model.rating))}`;
  const generated = new Date().toLocaleDateString('en-AU');

  const statCards = model.stats
    .map((s) => `<div class="stat"><div class="stat-v">${esc(s.value)}</div><div class="stat-l">${esc(s.label)}</div></div>`)
    .join('');

  const screens = model.screenshots
    .map(
      (shot, i) => `
    <section class="screen" id="screen-${i + 1}">
      <div class="screen-head">
        <span class="num">${i + 1}</span>
        <div>
          <h2>${esc(shot.title)}</h2>
          <p class="caption">${esc(shot.caption)}</p>
        </div>
      </div>
      <div class="guide">
        <span class="guide-chip">Guide</span>
        <div>
          <strong>${esc(shot.guide.title)}</strong>
          <p><em>Do this:</em> ${esc(shot.guide.tip)}</p>
          <p><em>Watch:</em> ${esc(shot.guide.watch)}</p>
        </div>
      </div>
      <h3>On this screen right now</h3>
      <ul class="points">${shot.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
      <h3>AI brief</h3>
      <dl class="brief">
        <dt>Purpose</dt><dd>${esc(shot.brief.purpose)}</dd>
        <dt>Impact</dt><dd>${esc(shot.brief.impact)}</dd>
        <dt>Outcome</dt><dd>${esc(shot.brief.outcome)}</dd>
      </dl>
      <h3>By industry</h3>
      <ul class="points">${shot.brief.examples.map((e) => `<li><strong>${esc(e.industry)}:</strong> ${esc(e.example)}</li>`).join('')}</ul>
    </section>`,
    )
    .join('');

  const features = model.features
    .map((f) => `<div class="feature"><strong>${esc(f.title)}</strong><p>${esc(f.detail)}</p></div>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(model.appName)} — product demo</title>
<style>
  :root { --brand: ${esc(brand)}; --ink: #1e293b; --muted: #64748b; --paper: #f6e6a2; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); background: #f1f5f9; }
  .hero { background: linear-gradient(135deg, var(--brand) 0%, var(--brand) 55%, #0f172a 130%); color: #fff; padding: 48px 24px; }
  .hero-inner { max-width: 960px; margin: 0 auto; }
  h1 { margin: 0 0 8px; font-size: 32px; letter-spacing: -0.02em; }
  .tagline { margin: 0 0 12px; color: rgba(255,255,255,.85); font-size: 16px; max-width: 640px; }
  .meta { color: rgba(255,255,255,.8); font-size: 13px; margin-bottom: 20px; }
  .stars { color: #fde68a; letter-spacing: 2px; }
  .cta { display: inline-block; background: #fff; color: #0f172a; font-weight: 700; text-decoration: none; padding: 12px 22px; border-radius: 999px; margin-top: 8px; }
  .cta:hover { opacity: .9; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 24px; }
  .stat { background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.2); border-radius: 12px; padding: 12px 16px; }
  .stat-v { font-size: 22px; font-weight: 800; }
  .stat-l { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: rgba(255,255,255,.7); }
  main { max-width: 960px; margin: 0 auto; padding: 32px 24px 64px; }
  .screen { background: #fff; border-radius: 16px; padding: 28px; margin-bottom: 28px; box-shadow: 0 10px 30px -18px rgba(15,23,42,.35); }
  .screen-head { display: flex; gap: 14px; align-items: flex-start; }
  .num { flex: none; width: 34px; height: 34px; border-radius: 10px; background: var(--brand); color: #fff; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  h2 { margin: 0 0 4px; font-size: 22px; }
  h3 { margin: 22px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
  .caption { margin: 0; color: var(--muted); }
  .guide { display: flex; gap: 12px; background: var(--paper); border-radius: 12px; padding: 14px 16px; margin-top: 16px; }
  .guide-chip { flex: none; align-self: flex-start; background: #22200f; color: #f7ecc6; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .18em; border-radius: 6px; padding: 4px 8px; }
  .guide p { margin: 4px 0 0; font-size: 14px; color: #574f2f; }
  .guide strong { font-size: 15px; color: #2f2c18; }
  ul.points { margin: 0; padding-left: 20px; color: #334155; }
  ul.points li { margin: 4px 0; }
  dl.brief { margin: 0; display: grid; grid-template-columns: 110px 1fr; gap: 6px 14px; }
  dl.brief dt { font-weight: 700; }
  dl.brief dd { margin: 0; color: var(--muted); }
  .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
  .feature { background: #fff; border-radius: 14px; padding: 18px 20px; box-shadow: 0 10px 30px -20px rgba(15,23,42,.35); }
  .feature p { margin: 6px 0 0; color: var(--muted); font-size: 14px; }
  footer { max-width: 960px; margin: 0 auto; padding: 0 24px 48px; color: var(--muted); font-size: 13px; }
  a.link { color: var(--brand); font-weight: 600; word-break: break-all; }
</style>
</head>
<body>
  <header class="hero">
    <div class="hero-inner">
      <h1>${esc(model.appName)}</h1>
      <p class="tagline">${esc(model.tagline)}</p>
      <div class="meta"><span class="stars">${stars}</span> ${esc(model.rating.toFixed(1))} · ${esc(model.reviews)} · tenant: ${esc(model.tenantName)} · entity: ${esc(model.entityName)} · generated ${generated}</div>
      <a class="cta" href="${esc(shareUrl)}">Open the live demo (all ${model.screenshots.length} screens + video tour) →</a>
      <div class="stats">${statCards}</div>
    </div>
  </header>
  <main>
    <h2 style="font-size:24px">Screenshots — ${model.screenshots.length} screens, full information</h2>
    <p style="color:var(--muted)">Live content from the ${esc(model.tenantName)} workspace. Open the <a class="link" href="${esc(shareUrl)}">live demo</a> for the pixel-perfect screens and the voiced video tour.</p>
    ${screens}
    <h2 style="font-size:24px;margin:40px 0 16px">Why every company needs it</h2>
    <div class="features">${features}</div>
  </main>
  <footer>
    ${esc(model.appName)} · shareable static export · live app: <a class="link" href="${esc(shareUrl)}">${esc(shareUrl)}</a>
  </footer>
</body>
</html>
`;
}

export function exportDemoStaticPage(model: DemoModel, shareUrl: string, filename = 'app-demo.html') {
  const blob = new Blob([buildDemoStaticPage(model, shareUrl)], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
