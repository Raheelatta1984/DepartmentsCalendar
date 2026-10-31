import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
window.scrollTo = () => {};

const errs = [];
console.error = (...a) => errs.push(a.map(String).join(' '));

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { StoreProvider, useStore, emptyActivity, newId } = await import('../src/store.tsx');
const { getScope } = await import('../src/lib/permissions.ts');
const { departmentScore, groupScore, employeeScore } = await import('../src/lib/analytics.ts');
const { buildHolidayDataset, COUNTRIES } = await import('../src/data/countries.ts');

const results = [];
let latest = null;
function Probe() {
  const store = useStore();
  latest = store;
  React.useEffect(() => {
    const s0 = latest.state;
    results.push(['seed employees', s0.employees.length]);
    results.push(['seed activities', s0.activities.length]);
    results.push(['seed time entries', s0.timeEntries.length]);
    results.push(['seed holidays', s0.holidays.length]);
    const ceo = s0.employees.find((e) => e.role === 'ceo');
    const emp = s0.employees.find((e) => e.role === 'employee');
    const department = s0.departments[0];
    const score = departmentScore(s0, department, 'week', new Date());
    results.push(['active department score', score.score, 'util', score.utilization, 'cap', score.capacityHours]);
    results.push(['employee score', employeeScore(s0, emp, score.periodStart, score.periodEnd).score]);
    results.push(['ceo scope', getScope(s0, ceo.id).visibleDepartments.length, getScope(s0, ceo.id).visibleEmployeeIds.length]);
    results.push(['employee scope', getScope(s0, emp.id).visibleEmployeeIds.length, getScope(s0, emp.id).visibleDepartments.length]);
    const coCeo = s0.employees.filter((e) => e.role === 'ceo')[1];
    results.push(['unassigned co-CEO scope', getScope(s0, coCeo.id).visibleDepartments.length]);
    const head = s0.employees.find((e) => e.role === 'department_head');
    results.push(['dept head scope', getScope(s0, head.id).visibleDepartments.length, getScope(s0, head.id).visibleEmployeeIds.length]);

    // create activity with sync
    const jobsBefore = s0.syncJobs.length;
    const a = { ...emptyActivity(s0), title: 'Smoke test activity', assigneeId: emp.id, departmentId: emp.departmentId, entityId: emp.entityId, sync: { outlook: true, google: true } };
    latest.upsertActivity(a);
    setTimeout(() => {
      const s1 = latest.state;
      results.push(['activity created', s1.activities.some((x) => x.id === a.id)]);
      results.push(['sync jobs added', s1.syncJobs.length - jobsBefore]);
      results.push(['audit logged', s1.auditLog.length > s0.auditLog.length, s0.auditLog.length, s1.auditLog.length]);

      latest.addTimeEntry({ id: newId('te'), employeeId: emp.id, activityId: a.id, date: new Date().toISOString().slice(0, 10), hours: 3, note: 'smoke', billable: true, approved: false });
      setTimeout(() => {
        const s2 = latest.state;
        results.push(['time entry added', s2.timeEntries.length - s0.timeEntries.length]);
        const holBefore = s2.holidays.length;
        const added = latest.generateHolidays('AE', 2032);
        setTimeout(() => {
          results.push(['generated holidays', added, 'total delta', latest.state.holidays.length - holBefore]);
          const escBefore = latest.state.escalations.length;
          /* The store is tenant-scoped: raise the escalation against a department in
   the active tenant, otherwise isolation correctly refuses to store it. */
            latest.upsertEscalation({ id: 'esc-smoke', departmentId: emp.departmentId, period: 'week', periodStart: score.periodStart, periodEnd: score.periodEnd, score: 40, threshold: 70, utilization: 50, onTimeRate: 40, recipients: [], cc: [], createdAt: new Date().toISOString(), status: 'open', note: 'smoke' });
          setTimeout(() => {
            results.push(['escalation added', latest.state.escalations.length - escBefore]);
            latest.setActiveUser(emp.id);
            setTimeout(() => {
              results.push(['active user switched', latest.state.settings.activeUserId === emp.id]);
              latest.deleteActivity(a.id);
              setTimeout(() => {
                results.push(['activity deleted', !latest.state.activities.some((x) => x.id === a.id)]);
                results.push(['time entries cascaded', !latest.state.timeEntries.some((x) => x.activityId === a.id)]);
                results.push(['errors', errs.length]);
                results.forEach((r) => console.log('CHECK', ...r));
                errs.slice(0, 5).forEach((e) => console.log('ERR', e.slice(0, 300)));
                try {
                  assert.equal(errs.length, 0, 'store actions must not log errors');
                  for (const name of ['activity created', 'audit logged', 'active user switched', 'activity deleted', 'time entries cascaded']) {
                    assert.equal(results.find((r) => r[0] === name)?.[1], true, name);
                  }
                  assert.equal(results.find((r) => r[0] === 'sync jobs added')?.[1], 2);
                  assert.equal(results.find((r) => r[0] === 'time entry added')?.[1], 1);
                  assert.equal(results.find((r) => r[0] === 'escalation added')?.[1], 1);
                  assert.ok(results.find((r) => r[0] === 'generated holidays')?.[1] > 0);
                  process.exit(0);
                } catch (error) {
                  console.log('FAIL', error.message);
                  process.exit(1);
                }
              }, 150);
            }, 150);
          }, 150);
        }, 150);
      }, 150);
    }, 150);
  }, []);
  return React.createElement('div', null, 'probe');
}

createRoot(document.getElementById('root')).render(React.createElement(StoreProvider, null, React.createElement(Probe)));
setTimeout(() => { console.log('TIMEOUT', results); process.exit(1); }, 8000);
