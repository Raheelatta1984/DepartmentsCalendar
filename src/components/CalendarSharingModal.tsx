import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Check, LockKeyhole, Share2, Trash2, UserPlus, Users } from 'lucide-react';
import { newId, useStore } from '../store';
import { Badge, Button, Card, EmptyState, Field, Modal, Select } from './ui';

export function CalendarSharingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, scope, shareCalendar, revokeCalendarShare } = useStore();
  const [audience, setAudience] = useState<'department' | 'employee'>('department');
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState('');

  const owner = scope.user;
  const department = state.departments.find((row) => row.id === owner.departmentId);
  const ownShares = state.calendarShares.filter((share) => share.ownerId === owner.id);
  const recipients = useMemo(
    () => state.employees
      .filter((employee) => employee.id !== owner.id && employee.status !== 'inactive')
      .sort((a, b) => {
        const departmentOrder = (state.departments.find((row) => row.id === a.departmentId)?.name ?? '')
          .localeCompare(state.departments.find((row) => row.id === b.departmentId)?.name ?? '');
        return departmentOrder || a.name.localeCompare(b.name);
      }),
    [state.employees, state.departments, owner.id],
  );

  useEffect(() => {
    if (!open) return;
    setError('');
    setAudience('department');
    setEmployeeId((current) => recipients.some((employee) => employee.id === current) ? current : recipients[0]?.id ?? '');
    // Initialise once per opening; saving a grant must not reset the next choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = () => {
    if (audience === 'employee' && !employeeId) return setError('Select the employee who should receive access.');
    const result = shareCalendar({
      id: newId('share'),
      ownerId: owner.id,
      audience,
      departmentId: audience === 'department' ? owner.departmentId : null,
      employeeId: audience === 'employee' ? employeeId : null,
      createdAt: new Date().toISOString(),
    });
    if (result) return setError(result);
    setError('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share my working calendar"
      subtitle="You decide when colleagues can see your activities and timesheet. Reporting-line access is unchanged; sharing never grants editing or on-behalf logging rights."
      width="max-w-2xl"
      footer={<Button size="sm" variant="primary" onClick={onClose}><Check className="h-3.5 w-3.5" /> Done</Button>}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-800">
          <LockKeyhole className="mt-0.5 h-4 w-4 flex-none" />
          <span><strong>Private by default.</strong> You cannot see teammates’ or line managers’ calendars unless they share with you. Your own reporting leads retain management access to your work.</span>
        </div>

        <Card className="!p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Share with">
              <Select value={audience} onChange={(event) => { setAudience(event.target.value as typeof audience); setError(''); }}>
                <option value="department">My department</option>
                <option value="employee">A specific employee</option>
              </Select>
            </Field>
            {audience === 'department' ? (
              <Field label="Department">
                <Select value={owner.departmentId} disabled>
                  <option value={owner.departmentId}>{department?.name ?? 'Home department'}</option>
                </Select>
              </Field>
            ) : (
              <Field label="Employee" hint={`${recipients.length} people in this tenant`}>
                <Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                  <option value="">Select employee…</option>
                  {recipients.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} · {state.departments.find((row) => row.id === employee.departmentId)?.code ?? '—'}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          {error ? <div role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{error}</div> : null}
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="primary" onClick={save}>
              {audience === 'department' ? <Users className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
              Share calendar
            </Button>
          </div>
        </Card>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-slate-800">Active sharing grants</h4>
              <p className="text-[10px] text-slate-500">Revoking a grant immediately removes that peer visibility.</p>
            </div>
            <Badge tone={ownShares.length ? 'good' : 'neutral'}>{ownShares.length} active</Badge>
          </div>
          <div className="space-y-2">
            {ownShares.map((share) => {
              const recipient = share.employeeId ? state.employees.find((employee) => employee.id === share.employeeId) : undefined;
              return (
                <div key={share.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    {share.audience === 'department' ? <Building2 className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-slate-800">
                      {share.audience === 'department' ? department?.name : recipient?.name ?? 'Former employee'}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {share.audience === 'department' ? 'Everyone in my home department' : 'Only this employee'} · read-only · since {share.createdAt.slice(0, 10)}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => revokeCalendarShare(share.id)} title="Revoke access">
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" /> <span className="hidden sm:inline">Revoke</span>
                  </Button>
                </div>
              );
            })}
            {!ownShares.length ? (
              <EmptyState
                icon={<Share2 className="h-5 w-5" />}
                title="Your calendar is not shared with peers"
                description="Share with your department for team-wide visibility, or choose one employee for a private grant."
              />
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
