import type { Tenant } from '../types';

/* ------------------------------------------------------------------ */
/* Tenant register                                                     */
/*                                                                     */
/* Three independent tenants share one pilot workspace:                 */
/*                                                                     */
/*   Harris Farm Markets — the default tenant. The calendar currently  */
/*   covers IT only, with editable co-CEO responsibilities and nested   */
/*   CIO / CTO / Data / Delivery / DevOps streams.                     */
/*                                                                     */
/*   Harbourline Retail Australia — a separate Australian retail demo  */
/*   with its own IT-first department rollout.                         */
/*                                                                     */
/*   Meridian Group Holdings — a diversified group that has rolled the  */
/*   calendar out to ALL departments, to show the multi-department mode.*/
/*                                                                     */
/* Tenants cannot see one another’s entities, people, activities,       */
/* timesheets, projects, PTO or audit trail.                             */
/* ------------------------------------------------------------------ */

export const HARRIS_FARM_TENANT_ID = 'tnt-harris-farm';
export const HARBOURLINE_TENANT_ID = 'tnt-harbourline';
export const MERIDIAN_TENANT_ID = 'tnt-meridian';

/** The tenant the portal opens on. */
export const DEFAULT_TENANT_ID = HARRIS_FARM_TENANT_ID;

/** Harris Farm Markets' IT department — the initial single-department calendar. */
export const HARRIS_FARM_IT_DEPT_ID = 'hfm-dept-it';

/** Harbourline’s IT department — retained as a separate demo tenant. */
export const HARBOURLINE_IT_DEPT_ID = 'rdept-it';

export const TENANTS: Tenant[] = [
  {
    id: HARRIS_FARM_TENANT_ID,
    name: 'Harris Farm Markets',
    code: 'HFM',
    countryCode: 'AU',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    industry: 'Retail — fresh food, stores & supply chain',
    status: 'active',
    // Initial rollout: IT only. Other co-CEO portfolios can be added later.
    calendarScope: { mode: 'single', departmentIds: [HARRIS_FARM_IT_DEPT_ID] },
    ptoAnnualEntitlementDays: 20,
    createdAt: '2026-10-31T00:00:00.000Z',
  },
  {
    id: HARBOURLINE_TENANT_ID,
    name: 'Harbourline Retail Australia',
    code: 'HRA',
    countryCode: 'AU',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    industry: 'Retail — stores, eCommerce & supply chain',
    status: 'active',
    // Separate example tenant with its own one-department IT rollout.
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
