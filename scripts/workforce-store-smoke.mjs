import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

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
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
window.scrollTo = () => {};

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { StoreProvider, useStore, emptyActivity } = await import('../src/store.tsx');
const { MERIDIAN_TENANT_ID } = await import('../src/data/tenant-seed.ts');

let latest = null;
function Probe() {
  latest = useStore();
  return React.createElement('div', null, 'workforce rules probe');
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 60));
async function switchUser(id) {
  latest.setActiveUser(id);
  await settle();
  assert.equal(latest.state.settings.activeUserId, id, `active user should be ${id}`);
}
const entry = (id, employeeId, activityId, date, startTime, endTime, hours) => ({
  id,
  employeeId,
  activityId,
  date,
  startTime,
  endTime,
  hours,
  note: id,
  billable: true,
  approved: false,
});

createRoot(document.getElementById('root')).render(
  React.createElement(StoreProvider, null, React.createElement(Probe)),
);

try {
  await settle();
  const seed = latest.state;
  const member = seed.employees.find((employee) =>
    employee.role === 'employee' && employee.status === 'active' && employee.managerId &&
    seed.employees.some((candidate) =>
      candidate.id !== employee.id && candidate.role === 'employee' && candidate.status === 'active' &&
      candidate.departmentId === employee.departmentId && candidate.managerId,
    ),
  );
  assert.ok(member, 'seed needs an active employee with a same-department peer');
  const peer = seed.employees.find((employee) =>
    employee.id !== member.id && employee.role === 'employee' && employee.status === 'active' &&
    employee.departmentId === member.departmentId && employee.managerId,
  );
  const lead = seed.employees.find((employee) => employee.id === peer.managerId);
  assert.ok(peer && lead, 'seed needs a peer and reporting lead');

  await switchUser(member.id);
  const ownActivity = emptyActivity(latest.state, {
    id: 'act-workforce-smoke',
    title: 'Workforce rules smoke task',
    type: 'task',
    startTime: '09:00',
    endTime: '10:00',
    plannedHours: 1,
    sync: { outlook: false, google: false },
  });

  const deniedMeeting = latest.upsertActivity({ ...ownActivity, id: 'act-denied-meeting', type: 'meeting', assigneeId: peer.id });
  assert.match(deniedMeeting ?? '', /Only the employee or their reporting lead/);
  console.log('PASS employees cannot create non-task work for a peer');

  assert.equal(latest.upsertActivity(ownActivity), null);
  await settle();
  assert.equal(latest.state.activities.find((activity) => activity.id === ownActivity.id)?.assigneeId, member.id);

  const historical = entry('te-workforce-history', member.id, ownActivity.id, ownActivity.startDate, '09:00', '10:00', 1);
  assert.equal(latest.addTimeEntry(historical), null);
  await settle();
  assert.equal(latest.state.timeEntries.find((row) => row.id === historical.id)?.employeeId, member.id);
  console.log('PASS employees log their own valid activity time');

  const badActivityHours = latest.upsertActivity({ ...ownActivity, plannedHours: 2 });
  assert.match(badActivityHours ?? '', /Hours do not match/);
  console.log('PASS activity submission holds on a duration mismatch');

  const delegated = {
    ...ownActivity,
    assigneeId: peer.id,
    delegationNote: 'Peer delegation regression coverage',
  };
  assert.equal(latest.upsertActivity(delegated), null);
  await settle();
  const storedDelegation = latest.state.activities.find((activity) => activity.id === ownActivity.id);
  assert.equal(storedDelegation.assigneeId, peer.id);
  assert.equal(storedDelegation.createdById, member.id);
  assert.equal(storedDelegation.delegationHistory.length, 1);
  assert.equal(storedDelegation.delegationHistory[0].fromEmployeeId, member.id);
  assert.equal(storedDelegation.delegationHistory[0].toEmployeeId, peer.id);
  assert.equal(latest.state.timeEntries.find((row) => row.id === historical.id)?.employeeId, member.id);
  console.log('PASS delegation transfers current ownership without rewriting history');

  const deniedEdit = latest.upsertActivity({ ...storedDelegation, title: 'Former owner cannot edit' });
  assert.match(deniedEdit ?? '', /read-only/);
  const deniedOnBehalf = latest.addTimeEntry(entry('te-denied-peer', peer.id, ownActivity.id, ownActivity.startDate, '10:00', '11:00', 1));
  assert.match(deniedOnBehalf ?? '', /only for yourself or a member of your reporting team/);
  console.log('PASS former owners and peers cannot edit or log for the delegatee');

  await switchUser(peer.id);
  const mismatch = latest.addTimeEntry(entry('te-workforce-mismatch', peer.id, ownActivity.id, ownActivity.startDate, '09:00', '10:00', 2));
  assert.match(mismatch ?? '', /Hours do not match/);
  const partial = latest.addTimeEntry(entry('te-workforce-partial', peer.id, ownActivity.id, ownActivity.startDate, '09:00', '', 1));
  assert.match(partial ?? '', /both a start and end time/);
  console.log('PASS timesheet submission holds on mismatched or partial windows');

  const valid = entry('te-workforce-valid', peer.id, ownActivity.id, ownActivity.startDate, '10:00', '11:00', 1);
  assert.equal(latest.addTimeEntry(valid), null);
  await settle();
  const storedValid = latest.state.timeEntries.find((row) => row.id === valid.id);
  assert.equal(storedValid.employeeId, peer.id);
  assert.equal(storedValid.loggedById, peer.id);
  latest.toggleEntryApproved(valid.id);
  await settle();
  assert.equal(latest.state.timeEntries.find((row) => row.id === valid.id).approved, false);
  console.log('PASS delegated work enters the assignee’s timesheet and self-approval is denied');

  await switchUser(lead.id);
  latest.toggleEntryApproved(valid.id);
  await settle();
  assert.equal(latest.state.timeEntries.find((row) => row.id === valid.id).approved, true);
  const onBehalf = entry('te-workforce-on-behalf', peer.id, ownActivity.id, ownActivity.startDate, '11:00', '12:00', 1);
  assert.equal(latest.addTimeEntry(onBehalf), null);
  await settle();
  assert.equal(latest.state.timeEntries.find((row) => row.id === onBehalf.id).loggedById, lead.id);
  console.log('PASS reporting lead can approve and log on behalf with an audit identity');

  await switchUser(member.id);
  assert.equal(latest.addTimeEntry({ ...historical, note: 'Corrected after delegation' }), null);
  await settle();
  assert.equal(latest.state.timeEntries.find((row) => row.id === historical.id).note, 'Corrected after delegation');
  assert.equal(latest.state.timeEntries.find((row) => row.id === historical.id).employeeId, member.id);
  console.log('PASS historical entries remain editable by their original owner');

  await switchUser(peer.id);
  assert.equal(latest.shareCalendar({
    id: 'share-workforce-smoke',
    ownerId: peer.id,
    audience: 'employee',
    departmentId: null,
    employeeId: member.id,
    createdAt: new Date().toISOString(),
  }), null);
  await switchUser(member.id);
  assert.equal(latest.scope.visibleEmployeeIds.includes(peer.id), true);
  const stillDenied = latest.addTimeEntry(entry('te-still-denied', peer.id, ownActivity.id, ownActivity.startDate, '12:00', '13:00', 1));
  assert.match(stillDenied ?? '', /only for yourself or a member of your reporting team/);
  const stillReadOnly = latest.upsertActivity({ ...storedDelegation, title: 'Sharing is not editing' });
  assert.match(stillReadOnly ?? '', /read-only/);
  const syncJobsBefore = latest.state.syncJobs.length;
  latest.pushToCalendars(ownActivity.id, ['outlook']);
  latest.connectCalendar({
    id: 'connection-share-denied',
    employeeId: peer.id,
    provider: 'outlook',
    accountEmail: peer.email,
    status: 'connected',
    lastSync: null,
    twoWay: true,
  });
  await settle();
  assert.equal(latest.state.syncJobs.length, syncJobsBefore);
  assert.equal(latest.state.connections.some((connection) => connection.id === 'connection-share-denied'), false);
  console.log('PASS explicit calendar sharing expands reads but never writes or integration administration');

  latest.setActiveTenant(MERIDIAN_TENANT_ID);
  await settle();
  assert.equal(latest.state.settings.activeTenantId, MERIDIAN_TENANT_ID);
  const multiDepartmentState = latest.state;
  const recipient = multiDepartmentState.employees.find((employee) =>
    employee.role === 'employee' && employee.status === 'active' &&
    multiDepartmentState.employees.some((candidate) =>
      candidate.id !== employee.id && candidate.role === 'employee' && candidate.status === 'active' &&
      candidate.departmentId !== employee.departmentId,
    ),
  );
  assert.ok(recipient, 'multi-department tenant needs an employee recipient');
  const crossDepartmentOwner = multiDepartmentState.employees.find((employee) =>
    employee.role === 'employee' && employee.status === 'active' && employee.departmentId !== recipient.departmentId,
  );
  assert.ok(crossDepartmentOwner, 'multi-department tenant needs a cross-department owner');
  latest.setCalendarScope({ mode: 'single', departmentIds: [recipient.departmentId] });
  await settle();
  await switchUser(crossDepartmentOwner.id);
  assert.equal(latest.shareCalendar({
    id: 'share-workforce-cross-department',
    ownerId: crossDepartmentOwner.id,
    audience: 'employee',
    departmentId: null,
    employeeId: recipient.id,
    createdAt: new Date().toISOString(),
  }), null);
  await switchUser(recipient.id);
  assert.equal(latest.scope.visibleEmployeeIds.includes(crossDepartmentOwner.id), true);
  const exposedOwnerDepartmentPeople = latest.scopedState.employees.filter(
    (employee) => employee.departmentId === crossDepartmentOwner.departmentId,
  );
  assert.deepEqual(exposedOwnerDepartmentPeople.map((employee) => employee.id), [crossDepartmentOwner.id]);
  assert.equal(latest.scopedState.activities
    .filter((activity) => activity.departmentId === crossDepartmentOwner.departmentId)
    .every((activity) => activity.assigneeId === crossDepartmentOwner.id), true);
  console.log('PASS single-department scope merges a direct cross-department grant for the owner only');

  console.log('WORKFORCE STORE PASS');
  process.exit(0);
} catch (error) {
  console.error('WORKFORCE STORE FAIL', error);
  process.exit(1);
}
