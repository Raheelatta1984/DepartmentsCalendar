import React, { useEffect, useRef, useState } from 'react';
import type { AppFilters, ViewKey } from '../types';
import { AiGuide } from './AiGuide';
import { Dashboard } from '../pages/Dashboard';
import { CalendarPage } from '../pages/CalendarPage';
import { ActivitiesPage } from '../pages/ActivitiesPage';
import { RoadmapPage } from '../pages/RoadmapPage';
import { TimesheetPage } from '../pages/TimesheetPage';
import { StandupsPage } from '../pages/StandupsPage';
import { OneOnOnesPage } from '../pages/OneOnOnesPage';
import { LeavePage } from '../pages/LeavePage';
import { DeliveryPage } from '../pages/DeliveryPage';
import { EffortReportsPage } from '../pages/EffortReportsPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { CapitalisationPage } from '../pages/CapitalisationPage';
import { PerformancePage } from '../pages/PerformancePage';
import { IntegrationsPage } from '../pages/IntegrationsPage';
import { OrganisationPage } from '../pages/OrganisationPage';
import { AdminPage } from '../pages/AdminPage';
import { WhatsNewPage } from '../pages/WhatsNewPage';
import { DeptReportPage } from '../pages/DeptReportPage';
import { ThemeStudioPage } from '../pages/ThemeStudioPage';

/* ------------------------------------------------------------------ */
/* RealScreen — renders the actual portal page for a view, so demo     */
/* screenshots are pixel-identical to what users see in the app.       */
/* ------------------------------------------------------------------ */

const noop = () => undefined;

export function RealScreen({ view, filters }: { view: ViewKey; filters: AppFilters }) {
  const setFilters = noop as (patch: Partial<AppFilters>) => void;
  const navigate = noop as (v: ViewKey) => void;
  switch (view) {
    case 'dashboard':
      return <><AiGuide view={view} filters={filters} /><Dashboard filters={filters} setFilters={setFilters} onNavigate={navigate} onOpenActivity={noop} onNewActivity={noop} onOpenEmployee={noop} /></>;
    case 'calendar':
      return <><AiGuide view={view} filters={filters} /><CalendarPage filters={filters} setFilters={setFilters} onOpenActivity={noop} onNewActivity={noop} onOpenEmployee={noop} /></>;
    case 'activities':
      return <><AiGuide view={view} filters={filters} /><ActivitiesPage filters={filters} setFilters={setFilters} onOpenActivity={noop} onNewActivity={noop} /></>;
    case 'roadmap':
      return <><AiGuide view={view} filters={filters} /><RoadmapPage filters={filters} setFilters={setFilters} onOpenActivity={noop} /></>;
    case 'timesheet':
      return <><AiGuide view={view} filters={filters} /><TimesheetPage filters={filters} setFilters={setFilters} onNewActivity={noop} /></>;
    case 'standups':
      return <><AiGuide view={view} filters={filters} /><StandupsPage /></>;
    case 'one-on-ones':
      return <><AiGuide view={view} filters={filters} /><OneOnOnesPage onNewActivity={noop} /></>;
    case 'leave':
      return <><AiGuide view={view} filters={filters} /><LeavePage filters={filters} /></>;
    case 'delivery':
      return <><AiGuide view={view} filters={filters} /><DeliveryPage onNewActivity={noop} onNavigate={navigate} /></>;
    case 'effort-reports':
      return <><AiGuide view={view} filters={filters} /><EffortReportsPage /></>;
    case 'projects':
      return <><AiGuide view={view} filters={filters} /><ProjectsPage /></>;
    case 'capitalisation':
      return <><AiGuide view={view} filters={filters} /><CapitalisationPage /></>;
    case 'performance':
      return <><AiGuide view={view} filters={filters} /><PerformancePage filters={filters} setFilters={setFilters} onOpenEmployee={noop} /></>;
    case 'integrations':
      return <><AiGuide view={view} filters={filters} /><IntegrationsPage /></>;
    case 'organisation':
      return <><AiGuide view={view} filters={filters} /><OrganisationPage /></>;
    case 'admin':
      return <><AiGuide view={view} filters={filters} /><AdminPage /></>;
    case 'whats-new':
      return <><AiGuide view={view} filters={filters} /><WhatsNewPage onNavigate={navigate} /></>;
    case 'dept-report':
      return <><AiGuide view={view} filters={filters} /><DeptReportPage /></>;
    case 'theme-studio':
      return <><AiGuide view={view} filters={filters} /><ThemeStudioPage /></>;
    case 'demo':
      // The demo page itself — render the real guide note plus a static panel to avoid recursion.
      return <><AiGuide view={view} filters={filters} /><div className="p-6 text-sm text-slate-500">App demo — this tour, live for the selected tenant &amp; entity.</div></>;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* ScaledFrame — fits the real 1440×810 screen into any frame width,   */
/* like a 20" display auto-adjusting to the demo tab.                  */
/* ------------------------------------------------------------------ */

export const SCREEN_W = 1440;
export const SCREEN_H = 810;

export function ScaledFrame({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth || SCREEN_W / 2;
      setScale(width / SCREEN_W);
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div ref={ref} className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: '16 / 9' }}>
      <div
        className="absolute left-0 top-0 origin-top-left bg-white"
        style={{ width: SCREEN_W, height: SCREEN_H, transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}
