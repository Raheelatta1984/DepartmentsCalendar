import type { Tenant } from '../types';

/* ------------------------------------------------------------------ */
/* Tenant register                                                     */
/*                                                                     */
/* Two independent tenants share one pilot workspace:                   */
/*                                                                     */
/*   Harbourline Retail Australia — the default tenant. Its calendar    */
/*   is implemented for ONE department (Information Technology), which  */
/*   is the IT-first roll-out the portal is designed around.            */
/*                                                                     */
/*   Meridian Group Holdings — a diversified group that has rolled the  */
/*   calendar out to ALL departments, to show the multi-department mode.*/
/*                                                                     */
/* Neither tenant can see the other’s entities, sub-entities,           */
/* departments, people, activities, timesheets, projects, stand-ups,    */
/* PTO or audit trail.                                                  */
/* ------------------------------------------------------------------ */

export const HARBOURLINE_TENANT_ID = 'tnt-harbourline';
export const MERIDIAN_TENANT_ID = 'tnt-meridian';

/** The tenant the portal opens on. */
export const DEFAULT_TENANT_ID = HARBOURLINE_TENANT_ID;

/** Harbourline’s IT department — the default single-department calendar. */
export const HARBOURLINE_IT_DEPT_ID = 'rdept-it';

export const TENANTS: Tenant[] = [
  {
    id: HARBOURLINE_TENANT_ID,
    name: 'Harbourline Retail Australia',
    code: 'HRA',
    countryCode: 'AU',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    industry: 'Retail — stores, eCommerce & supply chain',
    status: 'active',
    // Default set-up: one department, the IT department.
    calendarScope: { mode: 'single', departmentIds: [HARBOURLINE_IT_DEPT_ID] },
    ptoAnnualEntitlementDays: 20,
    createdAt: '2026-01-05T00:00:00.000Z',
  },
  {
    id: MERIDIAN_TENANT_ID,
    name: 'Meridian Group Holdings',
    code: 'MGH',
    countryCode: 'AE',
    timezone: 'Asia/Dubai',
    currency: 'AED',
    industry: 'Diversified holding',
    status: 'active',
    // Meridian runs the calendar for its whole group.
    calendarScope: { mode: 'all', departmentIds: [] },
    ptoAnnualEntitlementDays: 22,
    createdAt: '2026-01-05T00:00:00.000Z',
  },
];

export const TENANT_BY_ID = new Map(TENANTS.map((tenant) => [tenant.id, tenant]));
