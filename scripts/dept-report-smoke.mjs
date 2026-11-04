import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/* ------------------------------------------------------------------ */
/* Department status pack smoke                                        */
/*                                                                     */
/* Renders the portal on the new status-pack screen, checks the        */
/* department filter chips, and validates the pure report builder +    */
/* the PPTX deck builder + CSV export rows.                            */
/* ------------------------------------------------------------------ */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/#/dept-report', pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
window.print = () => { global.__printed = true; };
global.confirm = (...args) => window.confirm(...args);

const errors = [];
const originalError = console.error;
console.error = (...args) => { const message = args.map(String).join(' '); if (!message.includes('not wrapped in act')) errors.push(message); originalError(...args); };
window.addEventListener('error', (event) => errors.push(event.message));

const React = (await import('react')).default;
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { createSeedState } = await import('../src/data/seed.ts');
const { scopeStateToTenant } = await import('../src/lib/tenants.ts');
const { buildDepartmentReport, buildDepartmentReports, GOVERNANCE_COMMITMENTS } = await import('../src/lib/dept-report.ts');
const { buildReportDeck, COPILOT_REFORMAT_PROMPT, copyCopilotPrompt } = await import('../src/lib/dept-report-export.ts');
const { buildReportPDF } = await import('../src/lib/dept-report-pdf.ts');

// Pure builder: every department gets a complete attachment-style model.
const seed = createSeedState();
const scoped = scopeStateToTenant(seed, 'tnt-meridian');
for (const dept of scoped.departments) {
  const report = buildDepartmentReport(scoped, dept, 'week', new Date('2026-11-04T00:00:00'));
  assert.equal(report.departmentId, dept.id);
  assert.ok(['green', 'amber', 'red'].includes(report.rag));
  assert.ok(report.ragLabel && report.ragHint);
  assert.ok(report.workloadLabel.length > 0);
  assert.ok(Array.isArray(report.priorities) && Array.isArray(report.outcomes) && Array.isArray(report.milestones) && Array.isArray(report.risks));
  assert.deepEqual(report.governance, GOVERNANCE_COMMITMENTS);
  assert.ok(report.updateDate && report.actionTrackerDate);
}
const reports = buildDepartmentReports(scoped, scoped.departments.slice(0, 3), 'week', new Date('2026-11-04T00:00:00'));
assert.equal(reports.length, 3);
console.log('PASS: report builder produces a complete model per department');

// PPTX deck builder: title slide + Copilot prompt slide + one slide per department.
const deck = buildReportDeck(reports, 'Meridian Group Holdings');
assert.equal(deck.slides.length, 2 + reports.length, `deck has ${deck.slides.length} slides`);
assert.ok(COPILOT_REFORMAT_PROMPT.includes('Reformat this entire deck'), 'AI prompt instructs Copilot to reformat the deck');
assert.ok(COPILOT_REFORMAT_PROMPT.includes('#22C55E'), 'AI prompt pins the RAG colors');
console.log('PASS: PPTX deck builder creates title + Copilot prompt slide + one slide per department');

// Real PDF export: a valid PDF with one page per department plus title page.
const pdf = buildReportPDF(reports, 'Meridian Group Holdings');
const raw = pdf.output();
assert.ok(raw.startsWith('%PDF'), 'PDF output is a real PDF file');
assert.equal(pdf.getNumberOfPages(), 1 + reports.length, 'one PDF page per department plus title page');
const copied = await copyCopilotPrompt();
assert.equal(typeof copied, 'boolean', 'clipboard helper resolves');
console.log('PASS: PDF export produces a real colored PDF; Copilot prompt is clipboard-ready');

console.log('PASS: export helpers load');

// Render the real screen and drive the department filter.
seed.settings = { ...seed.settings, activeTenantId: 'tnt-meridian' };
localStorage.setItem('orbit.portal.state.v1', JSON.stringify(seed));
const { StoreProvider } = await import('../src/store.tsx');
const { ToastProvider } = await import('../src/components/toast.tsx');
const { App } = await import('../src/App.tsx');
const { NAV_ITEMS } = await import('../src/components/Layout.tsx');
assert.ok(NAV_ITEMS.some((item) => item.id === 'dept-report'), 'status pack is in the navigation');

const root = createRoot(document.getElementById('root'));
await act(async () => {
  root.render(React.createElement(StoreProvider, null, React.createElement(ToastProvider, null, React.createElement(App))));
});
const html = document.getElementById('root').innerHTML;
assert.ok(html.includes('Department status pack'), 'page header renders');
assert.ok(html.includes('Choose departments'), 'separate department-selection section renders');
assert.ok(html.includes('Export PPTX'), 'PPTX export action renders');
assert.ok(html.includes('Export PDF'), 'real PDF export action renders');
assert.ok(html.includes('Copy AI prompt'), 'Copilot AI-prompt copy action renders');
assert.ok(html.includes('Executive status'), 'attachment-style KPI row renders');
assert.ok(html.includes('Key milestones'), 'milestones section renders');
assert.ok(html.includes('Governance commitments'), 'governance section renders');

// Toggle one department chip off: its report card disappears.
const countCards = () => (document.getElementById('root').innerHTML.match(/Executive status/g) ?? []).length;
const chips = [...document.querySelectorAll('button[aria-pressed]')];
assert.ok(chips.length >= 2, 'department chips render');
const before = countCards();
assert.equal(before, chips.length, 'one report card per selected department');
const firstChip = chips[0];
await act(async () => { firstChip.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
assert.equal(countCards(), before - 1, 'deselecting a chip removes its report card');
await act(async () => { firstChip.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
assert.equal(countCards(), before, 'reselecting restores the report card');
console.log('PASS: status pack screen renders, department filter toggles reports, exports are wired');

assert.deepEqual(errors, [], `no runtime errors: ${errors.join(' | ')}`);
console.log('PASS: department status pack smoke — builder, deck, screen and filters all behave');
