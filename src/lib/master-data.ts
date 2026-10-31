import type { Designation, StoreState } from '../types';

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Heals older snapshots by linking their free-text job titles to reusable
 * designations. IDs are deterministic, so merely opening the portal never
 * creates duplicate master records or a perpetual shared-workspace change.
 */
export function withDesignationDefaults(state: StoreState): StoreState {
  const designations: Designation[] = Array.isArray(state.designations) ? [...state.designations] : [];
  const entityTenant = new Map(state.entities.map((entity) => [entity.id, entity.tenantId]));
  const departmentTenant = new Map(
    state.departments.map((department) => [department.id, entityTenant.get(department.entityId)]),
  );

  const employees = state.employees.map((employee) => {
    const linked = employee.designationId
      ? designations.find((designation) => designation.id === employee.designationId)
      : undefined;
    if (linked) {
      return employee.jobTitle?.trim()
        ? employee
        : { ...employee, jobTitle: linked.title };
    }

    const title = employee.jobTitle?.trim();
    const tenantId = departmentTenant.get(employee.departmentId) ?? entityTenant.get(employee.entityId);
    if (!title || !tenantId) return employee;

    let designation = designations.find(
      (row) => row.tenantId === tenantId && row.title.trim().toLowerCase() === title.toLowerCase(),
    );
    if (!designation) {
      designation = {
        id: `des-${stableHash(`${tenantId}:${title.toLowerCase()}`)}`,
        tenantId,
        title,
        code: title.replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase() || 'ROLE',
        description: '',
      };
      designations.push(designation);
    }
    return { ...employee, jobTitle: title, designationId: designation.id };
  });

  return { ...state, designations, employees };
}
