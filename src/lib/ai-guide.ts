import type { ViewKey } from '../types';

/* ------------------------------------------------------------------ */
/* AI guide content catalog                                            */
/*                                                                     */
/* Contextual guidance for every tab (view), section and sub-section   */
/* of the portal. The sticky note matches the heading / sub-tab the    */
/* user is looking at against the keyword rules below and shows the    */
/* most specific entry available. Runs entirely in the browser.        */
/* ------------------------------------------------------------------ */

export interface GuideEntry {
  title: string;
  /** Italic promise line printed under the title, like a sticky-note subtitle. */
  subtitle?: string;
  /** The prose explanation — what this screen is and why it exists. */
  blurb: string;
  /** “Do this” steps, printed as a numbered list. */
  tips: string[];
  /** “Watch” caution, printed in the sticky note’s warning tone. */
  watch?: string;
  /** Notes shown under the collapsible “Live context” disclosure. */
  context?: string[];
}

export interface GuideRule {
  /** Lower-case keywords; the rule with the most keyword hits wins. */
  match: string[];
  guide: GuideEntry;
}

export interface ViewGuide extends GuideEntry {
  /** Section / sub-section headings on this tab (matched against h2 headings). */
  sections: GuideRule[];
  /** Sub-tabs inside this tab (matched against the active tab chip). */
  subTabs: GuideRule[];
}

const grainSubTabs = (label: string): GuideRule[] => [
  {
    match: ['daily', ' day grain'],
    guide: {
      title: `${label} · daily grain`,
      blurb: 'The same score formula run on a single working day.',
      tips: [
        'A daily dip is noise until it repeats — watch the 8-period trend before acting.',
        'Capacity for one day = contracted weekly hours ÷ 5, minus holidays for that person’s country.',
        'Only elapsed days count in a running period, so Monday morning is never “20% utilized”.',
      ],
    },
  },
  {
    match: ['weekly'],
    guide: {
      title: `${label} · weekly grain`,
      blurb: 'The default operating rhythm for team reviews and escalation.',
      tips: [
        'Weekly scores drive the escalation queue — one record per department per week.',
        'Compare planned workload with logged hours before judging performance.',
        'Friday timesheets change Monday’s picture, so review after the week closes.',
      ],
    },
  },
  {
    match: ['monthly'],
    guide: {
      title: `${label} · monthly grain`,
      blurb: 'The grain used for management reporting and the capitalisation cut-off.',
      tips: [
        'Monthly utilization smooths day-to-day scheduling noise.',
        'Tie this view to the timesheet approval queue before publishing numbers.',
        'Escalations here copy the Head of Operations by design.',
      ],
    },
  },
  {
    match: ['quarterly'],
    guide: {
      title: `${label} · quarterly grain`,
      blurb: 'Quarterly review of delivery health across departments.',
      tips: [
        'Quarterly scores are the same formula — nothing to reconcile between grains.',
        'Look for structural trends: three consecutive falls need a plan, not a warning.',
        'Use capacity pressure to start resourcing conversations early.',
      ],
    },
  },
  {
    match: ['annual'],
    guide: {
      title: `${label} · annual grain`,
      blurb: 'The yearly view for board-style review of the whole group.',
      tips: [
        'Annual averages hide crunch periods — pair with quarterly grain.',
        'Year-to-date figures respect each country’s holiday calendar.',
        'This is the grain to export for performance review packs.',
      ],
    },
  },
];

export const AI_GUIDE: Record<ViewKey, ViewGuide> = {
  delivery: {
    title: 'DevOps delivery', subtitle: 'One backlog, connected to real calendar effort',
    blurb: 'Epics contain features, features contain tickets. Streams organise the department; project and funding links connect delivery to the existing capex workflow.',
    tips: ['Enable the department in Master setup, then create nested streams and assign a lead.', 'Import a CSV/JSON index or fetch an Azure DevOps work-item link. Review before committing.', 'Open a ticket and schedule an activity. Log actual time against that activity in Timesheets.'],
    watch: 'Backlog estimates, calendar plans and logged hours are different measures. A capex tag is not accounting approval.', sections: [], subTabs: [],
  },
  'effort-reports': {
    title: 'Delivery effort reports', subtitle: 'Plan, actuals and funding — without double counting',
    blurb: 'Report the same time entries by epic, feature, ticket, resource, department, stream or funding class. Ancestor rollups include descendant effort exactly once.',
    tips: ['Choose a date range and narrow by resource, department, stream or backlog item.', 'Switch the grouping to see cross-department contributions to an epic.', 'Export the grouped summary or the underlying activity-level ledger for reconciliation.'],
    watch: 'Planned hours are prorated across working days. Capex-tagged hours and policy-eligible capitalised hours are shown separately.', sections: [], subTabs: [],
  },
  dashboard: {
    title: 'Command centre',
    subtitle: 'The whole book on one screen, computed live',
    blurb:
      'One tenant, several legal entities: pick an entity in the filter bar and every card below — score, workload, trend, queues and the day board — re-reads the same period for that entity alone. Nothing here is a seeded string.',
    tips: [
      'Read the entity picker first: all entities in your scope, a group of companies, a company, or one of its subsidiaries.',
      'Check the score card: logged effort must reconcile with country-aware capacity before you judge a delivery score.',
      'Press a department row, an escalation or an activity to walk into its calendar, register and performance page.',
    ],
    watch:
      'A figure that looks wrong here is wrong everywhere: it is the same snapshot every other screen reads.',
    context: [
      'Entity focus follows your role: a department head only ever sees their own units.',
      'Scores use logged timesheet hours, never planned hours.',
      'The attention queue uses the performance threshold set in Master setup.',
    ],
    sections: [
      {
        match: ['performance trend', 'trend'],
        guide: {
          title: 'Group performance trend',
          blurb: 'Delivery score, utilization and on-time rate across the last 8 periods at the selected grain.',
          tips: [
            'Score below the threshold line flags a department for follow-up.',
            'A falling trend with rising utilization usually means overload or rework, not laziness.',
            'Change the grain to separate one-off dips from structural issues.',
          ],
        },
      },
      {
        match: ['where effort goes', 'effort goes'],
        guide: {
          title: 'Where effort goes',
          blurb: 'Planned hours by activity type for the selected period.',
          tips: [
            'Compare meetings and seminars against delivery work — meeting-heavy weeks rarely score well.',
            'Planned hours here explain the plan-vs-actual gap in Timesheets.',
          ],
        },
      },
      {
        match: ['department scorecard', 'scorecard'],
        guide: {
          title: 'Department scorecard',
          blurb: 'Collective workload and performance per department for the current period.',
          tips: [
            'Logged vs capacity hours is the workload measure — planned hours never enter the score.',
            'On-time rate counts only activities whose deadline has already passed.',
            'Drill into a row to see its people, activities and trend.',
          ],
        },
      },
      {
        match: ['attention queue', 'threshold'],
        guide: {
          title: 'Attention queue',
          blurb: 'Departments scoring under the configured threshold this period.',
          tips: [
            'Escalation emails go to the department head (To) with the Head of Operations (CC).',
            'Scores recover as timesheets are logged and activities complete.',
            'Adjust the threshold in Master setup → Group settings if needed.',
          ],
        },
      },
      {
        match: ['workload outliers', 'outliers'],
        guide: {
          title: 'Workload outliers',
          blurb: 'Utilization against country-aware capacity for every person in scope.',
          tips: [
            'Utilization far above 100% predicts burnout and missed deadlines; far below 85% means spare capacity.',
            'Capacity already excludes weekends and public holidays for each person’s country.',
            'Rebalance activities or revisit contracted hours — both are visible here.',
          ],
        },
      },
      {
        match: ['today across', 'today'],
        guide: {
          title: 'Today across the group',
          blurb: 'The live day board for every department in your scope.',
          tips: [
            'Log time straight from an activity — the timesheet is the source of truth.',
            'Overdue and blocked items are highlighted for immediate follow-up.',
            'Click an activity to open its detail, subtasks and calendar sync toggles.',
          ],
        },
      },
      {
        match: ['logged effort'],
        guide: {
          title: 'Logged effort by department',
          blurb: 'Hours actually recorded in the selected period.',
          tips: [
            'Compare with the scorecard to see whether effort is converting into delivery.',
            'Hours without matching activities signal unlogged or unplanned work.',
          ],
        },
      },
      {
        match: ['sync health'],
        guide: {
          title: 'Calendar sync health',
          blurb: 'Outlook (Microsoft Graph) and Google Calendar connector status.',
          tips: [
            'Connected mailboxes receive create/update/delete pushes for synced activities.',
            'A failed sync never blocks calendar work — .ics export is the universal fallback.',
          ],
        },
      },
      {
        match: ['activity mix'],
        guide: {
          title: 'Activity mix this period',
          blurb: 'Delivery shape of the period by activity type.',
          tips: [
            'A healthy mix is dominated by tasks and follow-ups, not meetings.',
            'Use it to challenge seminar and session overload before the next planning cycle.',
          ],
        },
      },
    ],
    subTabs: grainSubTabs('Command centre'),
  },

  calendar: {
    title: 'Department calendar',
    subtitle: 'Every entity, department, person and holiday on one timeline',
    blurb:
      'Year, quarter, month, team-week and day grains of the same calendar, with country-aware shading for weekends and public holidays. Every day cell holds every activity booked on it — nothing is hidden behind a corner widget or a fixed three-item limit.',
    tips: [
      'Pick the grain first: Year and Quarter show where the load sits, Month plans it, Week and Day execute it.',
      'Open the department and person pickers to read a team’s or one person’s calendar.',
      'A busy day shows its first few tasks plus “+N more” — press it to expand the day in place, or double-click the day for the full schedule.',
      'Holiday shading means deadlines on non-working days are visible immediately.',
    ],
    watch:
      'A deadline sitting on a shaded day is already slipping — the shading is country-aware, not cosmetic.',
    context: [
      'Weekends come from each country’s own rules, not a global setting.',
      'Holiday shading and capacity use the same holiday calendar.',
      'The grain you pick here is the period filter the guide’s live context reads.',
    ],
    sections: [
      {
        match: ['today', 'mon ', 'tue ', 'wed ', 'thu ', 'fri ', 'sat ', 'sun '],
        guide: {
          title: 'Day panel',
          blurb: 'The selected day’s activities with logged hours beside planned effort.',
          tips: [
            'Click any activity to open it, update status or log time.',
            'New activities created here inherit the selected date and department.',
            'Same-day meetings with times appear in chronological order.',
          ],
        },
      },
      {
        match: ['review an employee', 'review'],
        guide: {
          title: 'Review an employee',
          blurb: 'Manager-style review of one person’s calendar and utilization.',
          tips: [
            'Supervisors see their reporting line; department heads see the whole department.',
            'Utilization beside the name is logged hours ÷ capacity for the visible period.',
            'Export the person’s calendar to .ics for Outlook or Google.',
          ],
        },
      },
      {
        match: ['non-working', 'upcoming'],
        guide: {
          title: 'Upcoming non-working days',
          blurb: 'Country weekends and public holidays coming up in scope.',
          tips: [
            'Shaded days come from each country’s weekend rules and holiday calendar.',
            'Capacity already excludes these days — reschedule rather than absorb them.',
            'Ramadan and Eid dates are tentative planning dates by nature.',
          ],
        },
      },
    ],
    subTabs: [
      {
        match: ['year'],
        guide: {
          title: 'Calendar · year',
          blurb: 'Twelve months of the selected scope on one board — the planning horizon before quarter and month detail.',
          tips: [
            'Read the dots and day totals to find the months already carrying heavy load.',
            'Click a day to read it in the day panel; double-click to open it in the Day grain.',
            'Use it before committing next year’s portfolio, not for day-to-day dispatch.',
          ],
        },
      },
      {
        match: ['quarter'],
        guide: {
          title: 'Calendar · quarter',
          blurb: 'Three months side by side for the quarter containing the anchor date.',
          tips: [
            'Compare the three months before promising a quarter’s delivery.',
            'Crowded cells expand with “+N more”, so a clash is never hidden behind a cap.',
            'Shift a quarter at a time to look one quarter ahead of the plan.',
          ],
        },
      },
      {
        match: ['month'],
        guide: {
          title: 'Calendar · month',
          blurb: 'The whole month at a glance for the selected department or person.',
          tips: [
            'Each day shows its tasks in time order; “+N more” expands a crowded day in place.',
            'Holiday shading is country-aware for the person in focus.',
            'Click a day to review it in the day panel, double-click to open the Day grain.',
          ],
        },
      },
      {
        match: ['team week', 'swimlane', 'week'],
        guide: {
          title: 'Calendar · week',
          blurb: 'One swimlane per person across the working week.',
          tips: [
            'Spot collisions and idle days across the team in a single view.',
            'Every cell stacks each person’s tasks for that day; “+N more” expands it in place.',
            'Utilization per lane is logged ÷ capacity for the week to date.',
          ],
        },
      },
      {
        match: ['day'],
        guide: {
          title: 'Calendar · day',
          blurb: 'A single working day in schedule order, grouped by person.',
          tips: [
            'Best view for daily stand-ups and handover conversations.',
            'Every task booked that day is listed — no caps, no hidden items.',
            'Log time against each item as the day progresses.',
          ],
        },
      },
    ],
  },

  activities: {
    title: 'Activity register',
    subtitle: 'The register every other screen reads from',
    blurb:
      'Every task, follow-up, appointment, meeting, seminar, session, training, audit and site visit — with subtasks, priority, status, progress and calendar sync.',
    tips: [
      'Filter chips scope the register to all, open or in-period items.',
      'Planned vs logged hours per row is the early-warning signal for slippage.',
      'Sync toggles push create/update/delete to connected Outlook or Google calendars.',
      'Export CSV for audit trails or .ics to mirror the register outside the portal.',
    ],
    watch:
      'Only logged time counts: a task marked complete with no timesheet still scores zero.',
    context: [
      'Subtasks carry their own planned hours for finer tracking.',
      'Export CSV for audit trails, .ics to mirror the register outside the portal.',
    ],
    sections: [
      {
        match: ['register', 'table'],
        guide: {
          title: 'Register table',
          blurb: 'The full activity list in your scope.',
          tips: [
            'Overdue items sort attention first — deadline has passed but status is open.',
            'Click a row to open the full detail modal.',
            'Subtasks carry their own planned hours for finer tracking.',
          ],
        },
      },
    ],
    subTabs: [
      {
        match: ['all'],
        guide: {
          title: 'Register · all',
          blurb: 'Everything in scope, newest first.',
          tips: ['Use search to narrow by title or description.', 'Export the filtered view to CSV.'],
        },
      },
      {
        match: ['open'],
        guide: {
          title: 'Register · open',
          blurb: 'Not yet completed or cancelled work.',
          tips: [
            'Blocked items need an owner decision — clear them first.',
            'Progress below plan with a near deadline is a forecast breach.',
          ],
        },
      },
      {
        match: ['period', 'this period'],
        guide: {
          title: 'Register · this period',
          blurb: 'Activities overlapping the selected reporting period.',
          tips: ['Matches the period grain chosen on the Command centre.', 'Best basis for team review meetings.'],
        },
      },
    ],
  },

  roadmap: {
    title: 'Roadmap timeline',
    subtitle: 'Hierarchy on the left, time across the top',
    blurb:
      'Departments, employees, activities and subtasks on the left; year, quarter, month, ISO week, day and date across the top — with holiday shading.',
    tips: [
      'Collapse or expand hierarchy levels to move between group and task views.',
      'Holiday and weekend shading prevents false slippage signals.',
      'Change the horizon (13 / 26 / 52 weeks) to match the planning cycle.',
      'Export CSV or .ics to share the roadmap outside the portal.',
    ],
    watch:
      'Collapsed rows hide real dates — expand before promising a delivery date.',
    context: [
      'The horizon is 13, 26 or 52 weeks — the same activity dates throughout.',
      'Today is marked so replanning conversations share one anchor.',
    ],
    sections: [
      {
        match: ['roadmap', 'timeline', 'grid'],
        guide: {
          title: 'Timeline grid',
          blurb: 'The full hierarchy against the chosen horizon.',
          tips: [
            'Today is marked so replanning conversations have a shared anchor.',
            'Bars are drawn from real activity dates, not decorative placeholders.',
            'Subtask rows show the fine grain behind every deliverable.',
          ],
        },
      },
    ],
    subTabs: [
      {
        match: ['13 weeks', 'quarter'],
        guide: {
          title: 'Roadmap · quarter',
          blurb: 'A 13-week horizon — the default planning window.',
          tips: ['Best for delivery leads steering a quarter.', 'Week numbers map to ISO weeks.'],
        },
      },
      {
        match: ['26 weeks', 'half'],
        guide: {
          title: 'Roadmap · half year',
          blurb: 'A 26-week horizon for mid-range planning.',
          tips: ['Use it for programme-level sequencing across departments.'],
        },
      },
      {
        match: ['52 weeks', 'full year', 'annual'],
        guide: {
          title: 'Roadmap · full year',
          blurb: 'A 52-week horizon for the annual plan.',
          tips: ['Zoom out to check the shape of the year; zoom in before judging feasibility.'],
        },
      },
    ],
  },

  timesheet: {
    title: 'Timesheets',
    subtitle: 'Logged effort — never planned effort — moves every score',
    blurb:
      'Daily effort by activity. Workload, utilization, performance scores and the capitalisation pack all read from these entries — planned hours never count.',
    tips: [
      'Team week grid is the fastest way to log a complete week.',
      'Entries taking a person above daily capacity are highlighted in rose.',
      'Approvals are role-gated: supervisors and above approve their scope.',
      'Plan vs actual compares planned hours with what was really logged.',
    ],
    watch:
      'An unapproved entry still counts toward utilization; approval is governance, not measurement.',
    context: [
      'Capacity per day = contracted weekly hours ÷ 5, minus that person’s public holidays.',
      'Billable flags feed client and capitalisation reporting downstream.',
    ],
    sections: [
      {
        match: ['entry history', 'history'],
        guide: {
          title: 'Entry history',
          blurb: 'The most recent entries for the selected person or team.',
          tips: [
            'Click any entry to edit hours, date or the note.',
            'Delete mistaken entries here — the audit trail keeps the record.',
          ],
        },
      },
      {
        match: ['approval queue', 'approval'],
        guide: {
          title: 'Approval queue',
          blurb: 'Entries waiting for a supervisor or manager decision.',
          tips: [
            'Approve individually or in bulk once the week is complete.',
            'Unapproved entries still count toward utilization — approval is governance, not measurement.',
            'Amended entries should carry an explanatory note.',
          ],
        },
      },
      {
        match: ['plan vs actual', 'actual'],
        guide: {
          title: 'Plan vs actual',
          blurb: 'Planned hours against logged hours for the week.',
          tips: [
            'Chronic under- or over-estimation is an estimation problem, not a people problem.',
            'Use the variance to improve future planned hours on similar activities.',
          ],
        },
      },
      {
        match: ['approval policy', 'policy'],
        guide: {
          title: 'Approval policy',
          blurb: 'The group governance rules behind the approval workflow.',
          tips: ['Read this before overriding a workflow or self-approving.', 'Policy is deliberately identical across entities.'],
        },
      },
    ],
    subTabs: [
      {
        match: ['team week', 'grid'],
        guide: {
          title: 'Timesheets · team week',
          blurb: 'The week grid: one row per person, one column per day.',
          tips: [
            'Log a whole week in one pass; cells show hours and activity counts.',
            'Rose rows exceed daily capacity and need rebalancing.',
          ],
        },
      },
      {
        match: ['entry history', 'entries', 'history'],
        guide: {
          title: 'Timesheets · entry history',
          blurb: 'Line-level history with edit and delete.',
          tips: ['Keep notes specific — auditors read them.', 'Billable flags feed client reporting.'],
        },
      },
      {
        match: ['approvals'],
        guide: {
          title: 'Timesheets · approvals',
          blurb: 'Governance queue for supervisors and managers.',
          tips: ['Bulk-approve after checking the plan-vs-actual column.', 'The approval action is attributed to you in the audit trail.'],
        },
      },
    ],
  },

  projects: {
    title: 'IT projects & capex',
    subtitle: 'Board-funded capital work and operational run work, side by side',
    blurb:
      'Board-funded capital projects and operational run work in one portfolio, with tasks that resources log daily effort against.',
    tips: [
      'Capital projects feed the capitalisation pack; operational projects are expensed.',
      'Each capital project carries its own capitalisation rate and window.',
      'Project tasks are real activities on the calendar and timesheet.',
      'Filter by entity, portfolio, category, stage or status.',
    ],
    watch:
      'Operational projects never capitalise, whatever stage they reach.',
    context: [
      'Capitalisation rates and windows are set per project, not per department.',
      'Budgets are held in the entity’s local currency.',
    ],
    sections: [
      {
        match: ['projects'],
        guide: {
          title: 'Project register',
          blurb: 'The portfolio list with capex/opex split and delivery stage.',
          tips: [
            'Budgets are in the entity’s local currency (AUD for Harbourline).',
            'Pipeline projects are funded but not yet capitalising.',
            'Stage moves idea → business case → approved → design → build → test → deploy → hypercare.',
          ],
        },
      },
      {
        match: ['project tasks', 'tasks'],
        guide: {
          title: 'Project tasks',
          blurb: 'The work packages resources log time against.',
          tips: [
            'Only capitalisable (green) tasks feed AASB 138 development effort.',
            'Phase tags — discovery to hypercare — decide eligibility.',
            'Planned hours here set resource expectations for the project.',
          ],
        },
      },
    ],
    subTabs: [],
  },

  capitalisation: {
    title: 'Capitalisation pack',
    subtitle: 'Eligible development effort, reconciled to the last logged hour',
    blurb:
      'AASB 138 eligible development effort converted to fully-loaded cost, reconciled to every logged hour, with monthly board approval and an evidence trail.',
    tips: [
      'Eligible phases: design, build, test, deploy, hypercare. Excluded: discovery, support, training.',
      'Capitalisation rate % = capitalisable capital-project hours ÷ all logged IT hours.',
      'Non-capital effort stays in Timesheets and Performance — it never appears here.',
      'Approver: Board Audit & Risk Committee on recommendation of the CIO and CFO.',
    ],
    watch:
      'Discovery, support and training are never capitalised — there is no override.',
    context: [
      'Approver: Board Audit & Risk Committee, on recommendation of the CIO and CFO.',
      'Capitalised, excluded and BAU effort must reconcile to every logged IT hour.',
    ],
    sections: [
      {
        match: ['where the month went', 'month went'],
        guide: {
          title: 'Where the month went',
          blurb: 'The full reconciliation of every logged IT hour in the month.',
          tips: [
            'Capitalised, capital-project excluded and BAU must add up to total IT effort.',
            'Nothing silently disappears — each bucket is auditable.',
          ],
        },
      },
      {
        match: ['board approval', 'board'],
        guide: {
          title: 'Board approval',
          blurb: 'Draft → submitted → approved / rejected with named actors and timestamps.',
          tips: [
            'Export the board pack CSV before the meeting.',
            'A rejected pack can be corrected and resubmitted; the decision note is kept.',
          ],
        },
      },
      {
        match: ['resource capitalisation', 'hours to approve', 'resource'],
        guide: {
          title: 'Resource capitalisation — hours to approve',
          blurb: 'Daily timesheet effort by person with fully-loaded hourly cost.',
          tips: [
            'Capitalised hours = logged hours on capital-project development tasks × project capitalisation rate.',
            'Monthly hours below the policy minimum are listed but not capitalised.',
            'Cost rates are editable per role in the workspace policy.',
          ],
        },
      },
      {
        match: ['capital projects in the pack', 'capital projects'],
        guide: {
          title: 'Capital projects in the pack',
          blurb: 'Capex budget, capitalisation rate and development effort per project.',
          tips: [
            'Pipeline projects appear but are not yet capitalising.',
            'Useful life and asset class feed the fixed-asset register downstream.',
          ],
        },
      },
      {
        match: ['excluded effort', 'excluded'],
        guide: {
          title: 'Excluded effort',
          blurb: 'Auditable reasons why hours are not capitalised.',
          tips: [
            'Support and training are always excluded by policy.',
            'The reconciliation shows the cost of keeping the lights on.',
          ],
        },
      },
      {
        match: ['evidence'],
        guide: {
          title: 'Evidence in the pack',
          blurb: 'Timesheet lines, project tasks and policy settings forming the evidence set.',
          tips: [
            'Download line-level evidence CSV for the auditors.',
            'The approver role is named in the pack header.',
          ],
        },
      },
    ],
    subTabs: [],
  },

  performance: {
    title: 'Performance & escalation',
    subtitle: 'One formula, at every grain, for every person',
    blurb:
      'The identical score formula at every grain, 8-period trends, capacity pressure, per-person scorecards and the escalation log with To/CC recipients.',
    tips: [
      'Score = 40% utilization score + 35% on-time + 25% completion.',
      'Utilization score = 100 − |utilization − 85| × 1.3, clamped 0–100 — idle and overload both hurt.',
      'Drill into a department to score each person with the same math.',
      'Escalations: department head (To), Head of Operations (CC).',
    ],
    watch:
      'High hours with a falling score is rework, not effort.',
    context: [
      'Escalations go to the department head, with the Head of Operations copied.',
      'Utilization score = 100 − |utilization − 85| × 1.3, clamped 0–100: idle and overload both hurt.',
    ],
    sections: [
      {
        match: ['portfolio trend', 'trend'],
        guide: {
          title: 'Portfolio trend',
          blurb: 'Score, utilization and on-time delivery across the last 8 periods.',
          tips: [
            'Watch score and utilization together — high hours with falling score means rework.',
            'Compare grains to separate noise from trend.',
          ],
        },
      },
      {
        match: ['capacity pressure', 'pressure'],
        guide: {
          title: 'Capacity pressure',
          blurb: 'Planned workload against available capacity.',
          tips: [
            'Pressure above 100% predicts next week’s breaches and escalation risk.',
            'Capacity is country-aware: weekends and public holidays are removed.',
          ],
        },
      },
      {
        match: ['performance matrix', 'matrix'],
        guide: {
          title: 'Department performance matrix',
          blurb: 'Daily, weekly, monthly, quarterly and annual scores with identical formulas.',
          tips: [
            'The number always reconciles between grains — no hidden weighting.',
            'Sort by score to find the tail that needs support first.',
          ],
        },
      },
      {
        match: ['employee scorecard', 'scorecard'],
        guide: {
          title: 'Employee scorecard',
          blurb: 'Per-person utilization, on-time rate and score inside the selected department.',
          tips: [
            'Use it in one-to-ones with concrete evidence, not vibes.',
            'A single bad week is coaching; a falling trend is a plan.',
          ],
        },
      },
      {
        match: ['escalation log', 'escalation'],
        guide: {
          title: 'Escalation log',
          blurb: 'Audit trail of every generated escalation with recipients and status.',
          tips: [
            'Duplicate suppression is per department, period and period start.',
            'Acknowledge or close with a note — the trail is kept for audit.',
          ],
        },
      },
    ],
    subTabs: grainSubTabs('Performance'),
  },

  integrations: {
    title: 'Calendar sync',
    subtitle: 'Outlook and Google, without ever blocking the calendar',
    blurb:
      'Outlook (Microsoft Graph) and Google Calendar connectors: connections per mailbox, idempotent writes, sync policy and troubleshooting.',
    tips: [
      'The activity ID is the calendar event UID — repeats never duplicate events.',
      '.ics export works with zero API setup and imports anywhere.',
      'Real OAuth delivery is a separate phase — see the production checklist.',
      'Per-activity sync toggles control what is pushed where.',
    ],
    watch:
      'A failed sync never blocks calendar work — .ics export is the universal fallback.',
    context: [
      'Two-way sync is per mailbox; the portal stays the source of truth.',
      'Connector health is shown for the entities your role can see.',
    ],
    sections: [
      {
        match: ['calendar connections', 'connections'],
        guide: {
          title: 'Employee calendar connections',
          blurb: 'Connect one mailbox at a time, or roll out by department.',
          tips: [
            'Two-way sync is the end state; outbound push works today.',
            'Pending and disconnected states are visible per person and provider.',
            'Disconnecting stops future syncs but keeps existing events.',
          ],
        },
      },
      {
        match: ['sync activity log', 'activity log'],
        guide: {
          title: 'Sync activity log',
          blurb: 'Every write, with action and provider response.',
          tips: [
            'Filter to failed rows and retry from the connection card.',
            'The log is capped to the most recent events for performance.',
          ],
        },
      },
      {
        match: ['production checklist', 'checklist'],
        guide: {
          title: 'Production checklist',
          blurb: 'What is real today and what still needs building.',
          tips: [
            'Neon, Entra ID, Google OAuth and the Vercel deployment are the moving parts.',
            'Individual authentication is still future work — treat data accordingly.',
          ],
        },
      },
      {
        match: ['sync policy'],
        guide: {
          title: 'Sync policy',
          blurb: 'Defaults applied to every new activity.',
          tips: ['Per-activity toggles can override the default.', 'Policy is identical across entities on purpose.'],
        },
      },
      {
        match: ['troubleshooting'],
        guide: {
          title: 'Troubleshooting',
          blurb: 'The most common failures and their fixes.',
          tips: [
            'Most failures are expired tokens or removed calendars.',
            'Reconnect the mailbox before retrying individual events.',
          ],
        },
      },
    ],
    subTabs: [
      { match: ['all'], guide: { title: 'Sync log · all', blurb: 'The complete recent write history.', tips: ['Use search to find one activity’s sync story.'] } },
      {
        match: ['synced'],
        guide: {
          title: 'Sync log · synced',
          blurb: 'Writes the provider accepted.',
          tips: ['This is the steady state — anything else needs attention.'],
        },
      },
      {
        match: ['queued'],
        guide: {
          title: 'Sync log · queued',
          blurb: 'Writes waiting for the connector.',
          tips: ['Queued writes send automatically once the connection is healthy.'],
        },
      },
      {
        match: ['failed'],
        guide: {
          title: 'Sync log · failed',
          blurb: 'Writes the provider rejected.',
          tips: ['Read the message beside each row — it names the cause.', 'Fix the connection, then retry from the connection card.'],
        },
      },
    ],
  },

  admin: {
    title: 'Master setup',
    subtitle: 'The master data behind every number you see',
    blurb:
      'Entities, departments, people, holiday calendars, group settings and the audit trail — the masters every calculation in the portal reads.',
    tips: [
      'Entities form a group → company → sub-company tree with country and timezone rules.',
      'Departments need an accountable head and an ops owner for escalation routing.',
      'Holiday generation covers a multi-year horizon across 12 countries.',
      'Every master change writes an audit entry.',
    ],
    watch:
      'An entity cannot be deleted while departments still point at it.',
    context: [
      'Holiday generation is idempotent — re-running it only fills missing years.',
      'Profiles are scoped per entity, so people are listed company by company.',
    ],
    sections: [
      {
        match: ['legal entity', 'entity hierarchy', 'entities & group'],
        guide: {
          title: 'Legal entity hierarchy',
          blurb: 'A group can hold any number of companies and sub-companies.',
          tips: [
            'Each entity carries its own country and timezone for calendar rules.',
            'Deleting an entity is blocked while departments still reference it.',
            'Profile switching in the top bar is scoped by this hierarchy.',
          ],
        },
      },
      {
        match: ['departments with', 'accountable heads', 'departments'],
        guide: {
          title: 'Departments with accountable heads',
          blurb: 'The head owns the calendar and the score; the Head of Operations is the default escalation copy.',
          tips: [
            'Calendar colour identifies the department across every screen.',
            'Cost centre feeds finance reporting.',
            'Unassigned heads are flagged in the stat strip above.',
          ],
        },
      },
      {
        match: ['employee & management', 'management master', 'employee master'],
        guide: {
          title: 'Employee & management master',
          blurb: 'Role and reporting line define visibility across the portal.',
          tips: [
            'Contracted weekly hours drive capacity and utilization.',
            'Profiles are per-entity — switch entity in the top-bar profile picker to see a company’s people only.',
            'Statuses: active, on leave, inactive.',
          ],
        },
      },
      {
        match: ['country holiday', 'holiday calendar'],
        guide: {
          title: 'Country holiday calendar',
          blurb: 'Public holidays and company holidays by country and year.',
          tips: [
            'Ramadan / Eid dates are tentative planning dates by nature.',
            'Add one-off company holidays as they are announced.',
            'Calendar and roadmap shade these days automatically.',
          ],
        },
      },
      {
        match: ['weekly off', 'weekend'],
        guide: {
          title: 'Weekly off by country',
          blurb: 'Weekend rules drive shading and working-day capacity.',
          tips: [
            'Weekends differ by country — Fri–Sat vs Sat–Sun and more.',
            'Changing a weekend recalculates capacity immediately.',
          ],
        },
      },
      {
        match: ['group settings', 'settings'],
        guide: {
          title: 'Group settings',
          blurb: 'Applied across every entity, department and calculation.',
          tips: [
            'Working-day window, holiday horizon and performance threshold live here.',
            'Threshold changes flow straight into the attention queue and escalation rule.',
          ],
        },
      },
      {
        match: ['workspace'],
        guide: {
          title: 'Workspace',
          blurb: 'Where the pilot data lives — shared Neon database or local demo storage.',
          tips: [
            'Export a JSON backup before schema changes.',
            'Shared mode is server-side; the browser never caches company data.',
          ],
        },
      },
      {
        match: ['danger zone'],
        guide: {
          title: 'Danger zone',
          blurb: 'Destructive demo operations.',
          tips: ['Reset returns the local demo to its seeded state.', 'Shared workspaces cannot be reset from the browser.'],
        },
      },
      {
        match: ['audit trail', 'audit'],
        guide: {
          title: 'Audit trail',
          blurb: 'Who changed what, when — the evidence trail auditors ask for.',
          tips: ['The pilot keeps the most recent events.', 'Use it to verify master data changes and approvals.'],
        },
      },
    ],
    subTabs: [
      {
        match: ['entities & group', 'entities'],
        guide: {
          title: 'Master setup · entities',
          blurb: 'The legal entity tree.',
          tips: ['Group → company → sub-company, each with country and timezone.', 'Add entities here before onboarding their departments.'],
        },
      },
      {
        match: ['departments'],
        guide: {
          title: 'Master setup · departments',
          blurb: 'Department master with accountable heads.',
          tips: ['Every department belongs to exactly one entity.', 'Head and ops owner drive escalation routing.'],
        },
      },
      {
        match: ['employees', 'people'],
        guide: {
          title: 'Master setup · employees',
          blurb: 'The staff and worker master.',
          tips: [
            'Role + reporting line define portal visibility.',
            'Use the entity filter to work company by company.',
            'Contracted weekly hours feed every capacity calculation.',
          ],
        },
      },
      {
        match: ['holidays & weekends', 'holidays'],
        guide: {
          title: 'Master setup · holidays & weekends',
          blurb: 'Country holiday calendars and weekend rules.',
          tips: ['Generate the multi-year horizon in one click.', 'Coverage view proves every country has complete data.'],
        },
      },
      {
        match: ['group settings'],
        guide: {
          title: 'Master setup · group settings',
          blurb: 'Global behaviour of scores, capacity and calendars.',
          tips: ['Change the performance threshold here.', 'Week-start affects every period calculation.'],
        },
      },
      {
        match: ['audit trail', 'audit'],
        guide: {
          title: 'Master setup · audit trail',
          blurb: 'The change history for the whole workspace.',
          tips: ['Filter by actor or action when investigating an incident.'],
        },
      },
      {
        match: ['holiday list', 'list'],
        guide: {
          title: 'Holidays · list',
          blurb: 'Every holiday record for the selected country and year.',
          tips: ['Add or remove individual holidays; capacity recalculates instantly.'],
        },
      },
      {
        match: ['coverage', 'year coverage'],
        guide: {
          title: 'Holidays · coverage',
          blurb: 'Multi-year completeness check per country.',
          tips: ['Fill gaps before relying on utilization numbers for those countries.'],
        },
      },
    ],
  },

  leave: {
    title: 'Leave, PTO and public holidays',
    subtitle: 'Tentative date → line-manager approval → approved PTO on every calendar',
    blurb:
      'Any employee can plan a holiday here as a tentative date. The request goes to the line manager; once approved it becomes approved holidays (PTO) on the tenant calendar for the employee, their line manager, up to hire management, and every colleague who may need cover. PTO is counted in its own hours bucket and always excludes public holidays, which are shown as PH. The tab also answers “who is away and who do I ask instead”.',
    tips: [
      'Pick the from/to dates and check the live preview: PTO hours, PH days excluded, weekly-off days and the balance after the request.',
      'Name a delegate if someone else should pick the work up — otherwise the first available manager up the line is offered as the responsible contact.',
      'Line managers, department heads and group executives approve or reject from the Approvals sub-tab; a decision note is kept with the record.',
      'Use the Team calendar sub-tab to see approved PTO and PH across the departments in scope, and who is next responsible for anyone away.',
    ],
    watch:
      'Only approved requests appear as PTO on the calendar, and public holidays are never counted as PTO. A tentative (pending) request is visible to the employee and their approvers, not as confirmed leave.',
    context: [
      'PTO hours = working days × contracted daily hours; PH and weekly-off days are excluded from both the hours and the balance.',
      'Sick, unpaid, parental, study and other leave are tracked but never draw down the PTO balance.',
      'Every screen only sees the active tenant, cut down to the departments the calendar is implemented for.',
    ],
    sections: [
      {
        match: ['plan a holiday', 'request', 'log a tentative date'],
        guide: {
          title: 'Plan a holiday',
          blurb: 'A tentative date range that only becomes PTO once it is approved.',
          tips: [
            'The preview recalculates as you change the dates — it shows exactly what will be counted.',
            'Overlapping pending or approved requests are blocked before submission.',
            'The reason and named delegate are visible to your approver.',
          ],
        },
      },
      {
        match: ['pto', 'balance', 'entitlement'],
        guide: {
          title: 'PTO balance',
          blurb: 'Entitlement, approved, pending and remaining hours, with PH excluded tracked separately.',
          tips: [
            'Entitlement comes from the tenant’s PTO policy (working days per year).',
            'PH excluded shows the public-holiday hours that fell inside approved leave and were not counted.',
            'Non-PTO absence (sick, unpaid …) is reported outside the PTO bucket.',
          ],
        },
      },
      {
        match: ['approval queue', 'approve'],
        guide: {
          title: 'Approval queue',
          blurb: 'Tentative dates waiting on the signed-in approver, with clash warnings and a decision note.',
          tips: [
            'Approving turns the range into PTO immediately for the whole management chain and every calendar.',
            'The queue warns when a teammate is already away on the same dates so cover can be checked first.',
            'Requests from your own line, your department, or the group appear here — never another tenant’s.',
          ],
        },
      },
      {
        match: ['team calendar', 'on leave today', 'public holidays this month', 'pto by person'],
        guide: {
          title: 'Team leave calendar',
          blurb: 'Approved PTO and PH across the calendar scope, with the next responsible contact for anyone away.',
          tips: [
            'Approved PTO is deliberately visible to all colleagues in scope so blockers and assistance can be planned.',
            'Public holidays are badged PH and are excluded from every PTO total.',
            'Next responsible follows the named delegate, then the first available manager, then the department head and operations owner.',
          ],
        },
      },
    ],
    subTabs: [
      {
        match: ['my leave'],
        guide: {
          title: 'Sub-tab · My leave & PTO',
          blurb: 'Your own balance, request form and request history.',
          tips: ['Approved rows are already PTO on the calendar; pending rows are still tentative.'],
        },
      },
      {
        match: ['approvals'],
        guide: {
          title: 'Sub-tab · Approvals',
          blurb: 'The decision queue for line managers, department heads and group executives.',
          tips: ['Every decision is written to the audit trail with the note and the approver.'],
        },
      },
      {
        match: ['team calendar'],
        guide: {
          title: 'Sub-tab · Team calendar',
          blurb: 'The month grid, who is away today and next responsible contact.',
          tips: ['Switch months with the arrows; the selected day lists everyone in scope and their status.'],
        },
      },
    ],
  },
  standups: {
    title: 'Daily stand-up',
    subtitle: 'One check-in a day, visible only to authorised leadership',
    blurb:
      'Every member records one stand-up per working day: what was completed on the last working day, a progress update, any blockers, support callouts (internal or cross-functional) and the action items for the day. Supervisors, managers and department heads track their own department; the CEO and COO start from an executive pulse and drill department by department, top to bottom through every employee layer. Plain employees only ever see their own form.',
    tips: [
      'Submit both the last-working-day update and the progress update — the form blocks submission until both are filled.',
      'Raise cross-functional support against the department that needs to help; it appears as a violet callout on the board and the dashboard pulse.',
      'Department leadership can acknowledge and resolve support callouts, and tick action items while tracking the team.',
      'Use the date navigator to review any previous working day; future days are closed by design.',
    ],
    watch:
      'A stand-up is department-scoped: nobody can read another department’s entries unless their role already scopes that department.',
    context: [
      'One row per employee per working day — re-saving replaces that day’s entry.',
      'Pending means no row exists yet; a draft is saved but not yet submitted.',
      'The dashboard pulse reads the same stand-up snapshot as this tab.',
    ],
    sections: [
      {
        match: ['my daily stand-up', 'my stand-up'],
        guide: {
          title: 'My stand-up',
          blurb: 'Your personal check-in form for the selected working day.',
          tips: [
            'Blockers can be left empty — that reads as “unblocked” on the board.',
            'Add action items with due dates and raise support requests before submitting.',
            'Drafts stay private to you; only submitted stand-ups reach leadership.',
          ],
        },
      },
      {
        match: ['department board', 'stand-up pulse'],
        guide: {
          title: 'Department board',
          blurb: 'The department read top to bottom: head, unit heads and managers, supervisors, then team members.',
          tips: [
            'Expand a person to read their full update, blockers, action items and support callouts.',
            'The pulse tiles reconcile to the rows below — submitted, pending, blockers, open support and open actions.',
            'Use Remind on a pending member to queue a workspace notification.',
          ],
        },
      },
      {
        match: ['executive pulse', 'department stand-up summary'],
        guide: {
          title: 'Executive pulse',
          blurb: 'High-level, department-wise stand-up summary for the CEO and Head of Operations.',
          tips: [
            'Cards surface submission rate plus blocker and support callouts at a glance.',
            'Open a department card to drill into the full top-to-bottom employee detail.',
            'Cross-functional callouts are flagged violet so inter-department dependencies do not hide.',
          ],
        },
      },
      {
        match: ['support callouts', 'support'],
        guide: {
          title: 'Support callouts',
          blurb: 'Internal help requests and cross-functional support raised inside a stand-up.',
          tips: [
            'Open → acknowledged → resolved is the full lifecycle; only department leadership can advance it.',
            'Cross-functional requests name the department being asked for help.',
          ],
        },
      },
    ],
    subTabs: [
      {
        match: ['my stand-up'],
        guide: {
          title: 'Sub-tab · My stand-up',
          blurb: 'Self-service check-in, available to every role.',
          tips: ['Save a draft if the day is still in motion, then submit once complete.'],
        },
      },
      {
        match: ['executive pulse'],
        guide: {
          title: 'Sub-tab · Executive pulse',
          blurb: 'CEO/COO summary across every department in their scope.',
          tips: ['Drill from any department card into its detailed board.'],
        },
      },
      {
        match: ['department board'],
        guide: {
          title: 'Sub-tab · Department board',
          blurb: 'Layered tracking for supervisors through department heads.',
          tips: ['Only departments inside your role scope appear in the picker.'],
        },
      },
    ],
  },

  'whats-new': {
    title: 'What’s new',
    subtitle: 'What changed, and what it means for you',
    blurb:
      'Every user-visible change, newest first — private calendar sharing, delegation, DevOps delivery, tenant onboarding and the platform work underneath them.',
    tips: [
      'Scan the top three entries after each update; “Just added” marks this week’s changes.',
      'Each entry links straight to the screen where the change lives.',
      'Older entries stay here after release so nothing gets lost between updates.',
    ],
    watch:
      'Release notes describe intent; the engine’s own figures remain the source of truth.',
    context: [
      'Entries are ordered by release date, not by which tab they belong to.',
    ],
    sections: [
      {
        match: ['recent updates', 'updates'],
        guide: {
          title: 'Recent updates',
          blurb: 'The running log of portal improvements.',
          tips: ['Bullets summarise what changed; the descriptions explain why it matters.'],
        },
      },
    ],
    subTabs: [],
  },

  'theme-studio': {
    title: 'Theme Studio',
    subtitle: 'One entity’s identity, previewed before it is applied',
    blurb:
      'Per-entity brand identity: logo, header and footer, accent and background colours, body and heading fonts — with a live preview before you apply.',
    tips: [
      'Every entity can carry its own look — switch entities to compare.',
      'Generate a concept first, then fine-tune any value by hand.',
      'Apply writes the theme to the selected entity only.',
    ],
    watch:
      'Apply writes to the selected entity only — the preview is not a saved draft.',
    context: [
      'No entity data leaves the browser: generation runs locally.',
      'Colour and typography changes are reversible from the same screen.',
    ],
    sections: [
      {
        match: ['theme concept', 'generate'],
        guide: {
          title: 'Generate a theme concept',
          blurb: 'Describe a mood and the local design engine suggests a safe palette.',
          tips: [
            'No entity data leaves the browser — it is a prompt-guided local generator, not a third-party model.',
            'Sample colours from your uploaded logo for brand-accurate accents.',
            'Generated values remain fully editable.',
          ],
        },
      },
      {
        match: ['fine-tune', 'fine tune'],
        guide: {
          title: 'Fine-tune your portal',
          blurb: 'Exact values for header, footer, colours and typography.',
          tips: [
            'Body and heading fonts change independently.',
            'Accent colour drives navigation highlights and key actions.',
            'Read-only roles cannot apply changes.',
          ],
        },
      },
      {
        match: ['live preview', 'preview'],
        guide: {
          title: 'Live preview',
          blurb: 'A faithful mock of the portal chrome with your draft theme.',
          tips: [
            'Preview updates as you type — commit only when it feels right.',
            'Switch entities to compare identities side by side.',
          ],
        },
      },
    ],
    subTabs: [],
  },
};

/** Normalised, space-padded text so keyword hits only match whole words/phrase runs. */
export function normaliseGuideText(text: string): string {
  return ` ${text.toLowerCase().replace(/\s+/g, ' ').trim()} `;
}

/** Returns the entry whose keywords score highest on the given text. */
export function matchGuideRule(rules: GuideRule[] | undefined, text: string): GuideEntry | null {
  if (!rules?.length || !text.trim()) return null;
  const haystack = normaliseGuideText(text);
  let best: { guide: GuideEntry; score: number } | null = null;
  for (const rule of rules) {
    let score = 0;
    for (const keyword of rule.match) {
      const needle = normaliseGuideText(keyword);
      if (needle.trim().length > 0 && haystack.includes(needle)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { guide: rule.guide, score };
  }
  return best?.guide ?? null;
}
