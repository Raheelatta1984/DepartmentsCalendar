import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/* Headless React store test for tenant switching and the leave lifecycle:
   request → approve → PTO on the calendar → tenant switch keeps everything
   inside its own tenant. */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.localStorage = dom.window.localStorage;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
window.scrollTo = () => {};

const errors = [];
const originalError = console.error;
console.error = (...args) => {
  errors.push(args.map(String).join(' '));
  originalError(...args);
};

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { StoreProvider, useStore } = await import('../src/store.tsx');
const { approvalQueue, leaveOnDate, nextResponsible, ptoSummary } = await import('../src/lib/leave.ts');
const { toISO } = await import('../src/lib/dates.ts');

let latest = null;
function Probe() {
  latest = useStore();
  return null;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const root = createRoot(document.getElementById('root'));
root.render(React.createElement(StoreProvider, null, React.createElement(Probe)));
await sleep(400);
// Keep the lifecycle fixture on Harbourline, whose fictional PTO sample is
// intentionally separate from the clean Harris Farm onboarding roster.
latest.setActiveTenant('tnt-harbourline');
await sleep(200);

assert.ok(latest, 'store mounted');
const results = [];
const push = (name, value) => results.push([name, value]);

/* ---- 1. Use Harbourline's seeded PTO fixture ----------------------- */
push('tenant', latest.state.settings.activeTenantId);
push('tenant name', latest.tenant?.name);
push('tenant employees', latest.state.employees.length);
push('scope mode', latest.calendarScope.mode);
push('scope departments', latest.calendarDepartmentIds.join(','));
assert.equal(latest.state.settings.activeTenantId, 'tnt-harbourline');
assert.equal(latest.calendarScope.mode, 'single');
assert.deepEqual(latest.calendarDepartmentIds, ['rdept-it']);
assert.ok(latest.state.employees.every((employee) => employee.id.startsWith('rtl-')), 'no Meridian person is loaded');
assert.ok(latest.state.leaves.every((leave) => latest.state.employees.some((employee) => employee.id === leave.employeeId)));

/* ---- 2. Every operational view reads only the scoped tenant -------- */
assert.ok(latest.scopedState.employees.every((employee) => employee.departmentId === 'rdept-it'));
assert.ok(latest.scopedState.activities.every((activity) => activity.departmentId === 'rdept-it'));
assert.ok(latest.scopedState.leaves.every((leave) => leave.departmentId === 'rdept-it'));

/* ---- 3. A member requests a tentative date ------------------------- */
const member = latest.state.employees.find(
  (employee) => employee.departmentId === 'rdept-it' && employee.role === 'employee',
);
assert.ok(member, 'an IT team member exists');
latest.setActiveUser(member.id);
await sleep(120);
assert.equal(latest.scope.user.id, member.id);

const before = latest.state.leaves.length;
const request = latest.submitLeave({
  employeeId: member.id,
  startDate: '2027-04-05',
  endDate: '2027-04-09',
  type: 'annual',
  reason: 'Storey test holiday',
  delegateId: null,
});
await sleep(120);
assert.ok(request, 'the request was created');
assert.equal(latest.state.leaves.length, before + 1, 'exactly one row added');
const stored = latest.state.leaves.find((leave) => leave.id === request.id);
assert.equal(stored.status, 'pending', 'a new request is tentative');
assert.ok(stored.hours > 0, 'PTO hours are calculated');
assert.equal(stored.hours, Math.round(stored.workingDays * (member.weeklyHours / 5) * 10) / 10);
assert.equal(leaveOnDate(latest.state, member.id, '2027-04-06'), undefined, 'pending is not yet PTO');
push('request hours', stored.hours);

/* ---- 4. The line manager approves it ------------------------------- */
const managerId = member.managerId;
assert.ok(managerId, 'the member reports to somebody');
latest.setActiveUser(managerId);
await sleep(150);
const queue = approvalQueue(latest.state, latest.scope);
assert.ok(queue.some((leave) => leave.id === request.id), 'the manager sees the request in the queue');

latest.decideLeave(request.id, 'approved', 'Cover agreed');
await sleep(150);
const approved = latest.state.leaves.find((leave) => leave.id === request.id);
assert.equal(approved.status, 'approved');
assert.equal(approved.decidedById, managerId);
assert.ok(approved.decidedAt);
assert.ok(leaveOnDate(latest.state, member.id, '2027-04-06'), 'approved leave is PTO on the calendar');

/* ---- 5. PTO summary and cover -------------------------------------- */
latest.setActiveUser(member.id);
await sleep(150);
const summary = ptoSummary(latest.state, member, latest.tenant, 2027);
assert.ok(summary.approvedPtoHours >= approved.hours, 'approved PTO is counted');
assert.equal(summary.remainingPtoHours, Math.max(0, summary.entitlementHours - summary.approvedPtoHours));
const cover = nextResponsible(latest.state, member.id, '2027-04-06');
assert.ok(cover, 'a responsible contact is offered while the member is on PTO');
assert.notEqual(cover.employee.id, member.id);

/* ---- 6. Switching tenant swaps every row --------------------------- */
const harbourlineIds = latest.state.employees.map((employee) => employee.id);
latest.setActiveTenant('tnt-meridian');
await sleep(200);
assert.equal(latest.state.settings.activeTenantId, 'tnt-meridian');
assert.ok(latest.state.employees.length > 0);
assert.ok(latest.state.employees.every((employee) => !harbourlineIds.includes(employee.id)), 'no Harbourline person leaks in');
assert.ok(latest.state.leaves.every((leave) => !harbourlineIds.includes(leave.employeeId)), 'no Harbourline leave leaks in');
assert.ok(latest.state.departments.every((department) => department.id.startsWith('dept-')), 'Meridian departments only');
const meridianLeavesBefore = latest.state.leaves.length;

/* A write in this tenant must not touch the other tenant. */
const meridianMember = latest.state.employees.find((employee) => employee.role === 'employee');
latest.submitLeave({
  employeeId: meridianMember.id,
  startDate: '2027-05-03',
  endDate: '2027-05-04',
  type: 'annual',
  reason: 'Meridian-only request',
  delegateId: null,
});
await sleep(150);
assert.equal(latest.state.leaves.length, meridianLeavesBefore + 1);

latest.setActiveTenant('tnt-harbourline');
await sleep(200);
assert.deepEqual(
  latest.state.employees.map((employee) => employee.id),
  harbourlineIds,
  'Harbourline is exactly as it was',
);
assert.ok(
  !latest.state.leaves.some((leave) => leave.reason === 'Meridian-only request'),
  'a Meridian request never appears in Harbourline',
);
assert.equal(latest.state.leaves.find((leave) => leave.id === request.id)?.status, 'approved', 'the Harbourline decision survived');

/* ---- 7. The master setting can widen or narrow the calendar -------- */
latest.setCalendarScope({ mode: 'all', departmentIds: [] });
await sleep(150);
assert.equal(latest.calendarScope.mode, 'all');
assert.ok(latest.calendarDepartmentIds.length > 1, 'all departments are in scope');
latest.setCalendarScope({ mode: 'multiple', departmentIds: ['rdept-it', 'rdept-storeops'] });
await sleep(150);
assert.deepEqual([...latest.calendarDepartmentIds].sort(), ['rdept-it', 'rdept-storeops']);
latest.setCalendarScope({ mode: 'single', departmentIds: ['rdept-it'] });
await sleep(150);
assert.deepEqual(latest.calendarDepartmentIds, ['rdept-it']);

assert.equal(errors.length, 0, `store actions must not log errors: ${errors.slice(0, 2).join(' | ')}`);
results.forEach((row) => console.log('CHECK', ...row));
await new Promise((resolve) => setTimeout(resolve, 100));
root.unmount();
dom.window.close();
console.log('PASS: tenant isolation, the leave lifecycle and the calendar-scope master setting all behave');
