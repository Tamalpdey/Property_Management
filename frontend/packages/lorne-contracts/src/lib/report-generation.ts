import type { InvoiceRecord, TenantSettingsRecord, WorkerActivityRecord, WorkerClockEntryRecord, WorkerDailyLoadout, WorkOrderRecord } from './index';

export type ReportType = 'WORKER' | 'PROPERTY';

export interface ReportGenerationData {
  workOrders: WorkOrderRecord[];
  invoices: InvoiceRecord[];
}

export interface DayTicketOptions {
  useActualTiming: boolean;
  includeStatus: boolean;
  includeService: boolean;
  includeTravel: boolean;
  includeRouteStops: boolean;
  includeActivities: boolean;
  includeWorkerNotes: boolean;
  includeTotals: boolean;
}

export interface DayTicketEntry {
  rowType: 'WORK_ORDER' | 'TRAVEL' | 'ROUTE_STOP' | 'WORKER_ACTIVITY';
  workOrder?: WorkOrderRecord;
  assignment?: WorkOrderRecord['assignments'][number];
  timeIn?: string;
  timeOut?: string;
  timeInFromSchedule: boolean;
  timeOutFromSchedule: boolean;
  minutes: number;
  routeStop?: WorkOrderRecord['routeStops'][number];
  activity?: WorkerActivityRecord;
  timingWarning?: string;
}

export interface DayTicketShiftSummary {
  clockIn?: string;
  clockOut?: string;
  minutes: number;
  pauseMinutes?: number;
  entries: WorkerClockEntryRecord[];
}

interface ActualTiming {
  arrivedAt?: string;
  finishedAt?: string;
  minutes: number;
  overridden: boolean;
  overrideReason?: string;
}

type WorkOrderAssignment = WorkOrderRecord['assignments'][number];

export function selectedReportRows(input: {
  data: ReportGenerationData;
  reportType: ReportType;
  targetId: string;
  dateFrom: string;
  dateTo: string;
}): WorkOrderRecord[] {
  if (!input.targetId) {
    return [];
  }
  const rows = input.reportType === 'WORKER'
    ? input.data.workOrders.filter((workOrder) => workOrder.assignments.some((assignment) => assignment.workerId === input.targetId))
    : input.data.workOrders.filter((workOrder) => workOrder.propertyId === input.targetId);
  return rows
    .filter((workOrder) => matchesDateRange(workOrder, input.dateFrom, input.dateTo))
    .sort((left, right) => dateValue(right.scheduledStart) - dateValue(left.scheduledStart));
}

export function workOrdersInDateRange(workOrders: WorkOrderRecord[], dateFrom: string, dateTo: string): WorkOrderRecord[] {
  return workOrders
    .filter((workOrder) => matchesDateRange(workOrder, dateFrom, dateTo))
    .sort((left, right) => dateValue(right.scheduledStart) - dateValue(left.scheduledStart));
}

export function selectedReportActualHours(rows: WorkOrderRecord[], reportType: ReportType, targetId: string): number {
  const minutes = rows.reduce((total, workOrder) => total + actualTimingFor(workOrder, reportType, targetId).minutes, 0);
  return Math.round((minutes / 60) * 10) / 10;
}

export function selectedReportInvoiceCount(data: ReportGenerationData, rows: WorkOrderRecord[]): number {
  const workOrderIds = new Set(rows.map((workOrder) => workOrder.id));
  return data.invoices.filter((invoice) => invoice.workOrderId && workOrderIds.has(invoice.workOrderId)).length;
}

export function workerNames(workOrder: WorkOrderRecord): string {
  if (workOrder.assignments.length === 0) {
    return 'Unassigned';
  }
  return workOrder.assignments
    .map((assignment) => `${assignment.workerName}${assignment.leadWorker ? ' (lead)' : ''}`)
    .join(', ');
}

export function statusLabel(status: string): string {
  return status.toLowerCase().replaceAll('_', ' ');
}

export function scheduleLabel(workOrder: WorkOrderRecord): string {
  if (!workOrder.scheduledStart && !workOrder.scheduledEnd) {
    return 'Unscheduled';
  }
  const start = workOrder.scheduledStart ? new Date(workOrder.scheduledStart) : null;
  const end = workOrder.scheduledEnd ? new Date(workOrder.scheduledEnd) : null;
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (start && end) {
    return `${formatter.format(start)} - ${formatter.format(end)}`;
  }
  return formatter.format(start ?? end ?? new Date());
}

export function actualTimingLabel(workOrder: WorkOrderRecord, reportType: ReportType, targetId: string): string {
  const timing = actualTimingFor(workOrder, reportType, targetId);
  const parts = [];
  if (timing.arrivedAt) {
    parts.push(`Arrived ${shortDateTime(timing.arrivedAt)}`);
  }
  if (timing.finishedAt) {
    parts.push(`Finished ${shortDateTime(timing.finishedAt)}`);
  }
  if (timing.minutes > 0) {
    parts.push(`${minutesLabel(timing.minutes)} work`);
  }
  return parts.length ? parts.join(' · ') : 'Not started';
}

export function actualMinutes(workOrder: WorkOrderRecord, reportType: ReportType, targetId: string): number {
  return actualTimingFor(workOrder, reportType, targetId).minutes;
}

export function printHtmlDocument(html: string): void {
  const printWindow = window.open('', '_blank', 'width=1000,height=1100');
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 250);
}

export function selectedReportHtml(input: {
  title: string;
  reportType: string;
  generatedAt: Date;
  dateRangeLabel: string;
  rows: WorkOrderRecord[];
  invoices: InvoiceRecord[];
  reportMode: ReportType;
  targetId: string;
}): string {
  const workOrderIds = new Set(input.rows.map((workOrder) => workOrder.id));
  const invoices = input.invoices.filter((invoice) => invoice.workOrderId && workOrderIds.has(invoice.workOrderId));
  const totalBilled = invoices.reduce((total, invoice) => total + Number(invoice.total || 0), 0);
  return `<!doctype html>
<html>
<head>
  <title>${escapeHtml(input.reportType)} - ${escapeHtml(input.title)}</title>
  <style>
    body { color: #0f172a; font-family: Arial, sans-serif; margin: 32px; }
    h1 { font-size: 28px; margin: 0; }
    .eyebrow { color: #0f766e; font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .meta { color: #64748b; font-size: 13px; margin-top: 6px; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 24px 0; }
    .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; }
    .card span { color: #64748b; display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .card strong { display: block; font-size: 22px; margin-top: 4px; }
    table { border-collapse: collapse; font-size: 12px; width: 100%; }
    th { background: #f1f5f9; color: #475569; font-size: 11px; text-align: left; text-transform: uppercase; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
    .status { color: #0f766e; font-weight: 800; text-transform: capitalize; }
    .override { color: #92400e; font-size: 10px; font-weight: 800; margin-top: 3px; text-transform: uppercase; }
    .override-row td { background: #fffbeb; }
    @media print { body { margin: 18mm; } }
  </style>
</head>
<body>
  <p class="eyebrow">${escapeHtml(input.reportType)}</p>
  <h1>${escapeHtml(input.title)}</h1>
  <p class="meta">Generated ${escapeHtml(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(input.generatedAt))}${input.dateRangeLabel ? ` · ${escapeHtml(input.dateRangeLabel)}` : ''}</p>
  <section class="summary">
    <div class="card"><span>Work orders</span><strong>${input.rows.length}</strong></div>
    <div class="card"><span>Open</span><strong>${input.rows.filter((workOrder) => !closedReportStatuses.has(workOrder.status)).length}</strong></div>
    <div class="card"><span>Completed</span><strong>${input.rows.filter((workOrder) => completedReportStatuses.has(workOrder.status)).length}</strong></div>
    <div class="card"><span>Billed</span><strong>${escapeHtml(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalBilled))}</strong></div>
    <div class="card"><span>Actual hours</span><strong>${selectedReportActualHours(input.rows, input.reportMode, input.targetId)}</strong></div>
  </section>
  <table>
    <thead><tr><th>Work order</th><th>Property</th><th>Worker(s)</th><th>Status</th><th>Schedule</th><th>Actual field time</th><th>Service</th></tr></thead>
    <tbody>
      ${input.rows.map((workOrder) => {
        const timing = actualTimingFor(workOrder, input.reportMode, input.targetId);
        return `
        <tr class="${timing.overridden ? 'override-row' : ''}">
          <td><strong>${escapeHtml(workOrder.workOrderNumber)}</strong><br>${escapeHtml(workOrder.title)}</td>
          <td>${escapeHtml(workOrder.propertyName)}<br><span class="meta">${escapeHtml(workOrder.ownerName)}</span></td>
          <td>${escapeHtml(workerNames(workOrder))}</td>
          <td><span class="status">${escapeHtml(statusLabel(workOrder.status))}</span></td>
          <td>${escapeHtml(scheduleLabel(workOrder))}</td>
          <td>
            ${escapeHtml(actualTimingLabel(workOrder, input.reportMode, input.targetId))}
            ${timing.overridden ? `<div class="override">Operations override${timing.overrideReason ? `: ${escapeHtml(timing.overrideReason)}` : ''}</div>` : ''}
          </td>
          <td>${escapeHtml(workOrder.serviceName || 'General service')}</td>
        </tr>
      `;
      }).join('')}
    </tbody>
  </table>
</body>
</html>`;
}

export function dayTicketRows(data: ReportGenerationData, workerId: string, dateFrom: string, dateTo: string, options: DayTicketOptions): DayTicketEntry[] {
  if (!workerId || (!dateFrom && !dateTo)) {
    return [];
  }
  const rows: DayTicketEntry[] = [];
  for (const workOrder of data.workOrders) {
    const assignment = workOrder.assignments.find((item) => item.workerId === workerId);
    if (!assignment) {
      continue;
    }
    const timing = dayTicketTiming(workOrder, assignment, options.useActualTiming);
    if (!dateInRange(timing.timeIn || workOrder.scheduledStart, dateFrom, dateTo)) {
      continue;
    }
    rows.push({
      rowType: 'WORK_ORDER',
      workOrder,
      assignment,
      timeIn: timing.timeIn,
      timeOut: timing.timeOut,
      timeInFromSchedule: timing.timeInFromSchedule,
      timeOutFromSchedule: timing.timeOutFromSchedule,
      minutes: timing.minutes
    });
    if (options.includeTravel) {
      const travelTiming = dayTicketTravelTiming(assignment);
      if (travelTiming && dateInRange(travelTiming.timeIn, dateFrom, dateTo)) {
        rows.push({
          rowType: 'TRAVEL',
          workOrder,
          assignment,
          timeIn: travelTiming.timeIn,
          timeOut: travelTiming.timeOut,
          timeInFromSchedule: false,
          timeOutFromSchedule: false,
          minutes: travelTiming.minutes,
          timingWarning: travelTiming.timingWarning
        });
      }
    }
    if (options.includeRouteStops) {
      for (const stop of workOrder.routeStops ?? []) {
        const stopTiming = dayTicketRouteStopTiming(stop, options.useActualTiming);
        if (!dateInRange(stopTiming.timeIn || workOrder.scheduledStart, dateFrom, dateTo)) {
          continue;
        }
        rows.push({
          rowType: 'ROUTE_STOP',
          workOrder,
          assignment,
          routeStop: stop,
          timeIn: stopTiming.timeIn,
          timeOut: stopTiming.timeOut,
          timeInFromSchedule: stopTiming.timeInFromSchedule,
          timeOutFromSchedule: stopTiming.timeOutFromSchedule,
          minutes: stopTiming.minutes
        });
      }
    }
  }
  return sortDayTicketRows(rows);
}

export function dayTicketActivityRows(activities: WorkerActivityRecord[], dateFrom: string, dateTo: string): DayTicketEntry[] {
  return sortDayTicketRows(
    activities
      .filter((activity) => dateInRange(activity.startedAt, dateFrom, dateTo))
      .map((activity) => ({
        rowType: 'WORKER_ACTIVITY',
        activity,
        timeIn: activity.startedAt,
        timeOut: activity.endedAt,
        timeInFromSchedule: false,
        timeOutFromSchedule: false,
        minutes: activity.durationMinutes ?? minutesBetween(activity.startedAt, activity.endedAt)
      }))
  );
}

export function sortDayTicketRows(rows: DayTicketEntry[]): DayTicketEntry[] {
  return rows.sort((left, right) => dateValue(rowSortTime(left)) - dateValue(rowSortTime(right)));
}

export function dayTicketDescription(entry: DayTicketEntry, options: DayTicketOptions): string {
  if (entry.rowType === 'WORKER_ACTIVITY' && entry.activity) {
    const parts = [`${activityTypeLabel(entry.activity.activityType)}: ${entry.activity.title}`];
    if (entry.activity.locationName) {
      parts.push(entry.activity.locationName);
    }
    if (entry.activity.address) {
      parts.push(entry.activity.address);
    }
    if (entry.activity.notes) {
      parts.push(entry.activity.notes);
    }
    return parts.join(' · ');
  }
  if (entry.rowType === 'ROUTE_STOP' && entry.routeStop) {
    const parts = [
      `${routeStopTypeLabel(entry.routeStop.stopType)}: ${entry.routeStop.name}`
    ];
    if (entry.routeStop.address) {
      parts.push(entry.routeStop.address);
    }
    if (entry.routeStop.instructions) {
      parts.push(entry.routeStop.instructions);
    }
    return parts.join(' · ');
  }
  if (entry.rowType === 'TRAVEL' && entry.workOrder) {
    const destination = entry.workOrder.propertyName || entry.workOrder.propertyAddress || 'site';
    return `Start travel to ${destination}`;
  }
  if (!entry.workOrder) {
    return '';
  }
  const parts = [entry.workOrder.title];
  if (options.includeService && entry.workOrder.serviceName) {
    parts.push(entry.workOrder.serviceName);
  }
  if (options.includeStatus) {
    parts.push(statusLabel(entry.workOrder.status));
  }
  return parts.join(' · ');
}

export function dayTicketRowTypeLabel(entry: DayTicketEntry): string {
  if (entry.rowType === 'TRAVEL') {
    return 'Travel';
  }
  if (entry.rowType === 'ROUTE_STOP') {
    return 'Route stop';
  }
  if (entry.rowType === 'WORKER_ACTIVITY') {
    return activityTypeLabel(entry.activity?.activityType || 'OTHER');
  }
  return 'Site work';
}

export function dayTicketTotalMinutes(rows: DayTicketEntry[], shiftSummary?: DayTicketShiftSummary): number {
  const rowTotalMinutes = rows.reduce((total, row) => total + row.minutes, 0);
  const shiftMinutes = shiftSummary?.entries.length ? shiftSummary.minutes : rowTotalMinutes;
  const shiftPauseMinutes = shiftSummary?.pauseMinutes ?? 0;
  return Math.max(0, shiftMinutes - shiftPauseMinutes - dayTicketDownTimeMinutes(rows));
}

export function dayTicketHtml(input: {
  workerName: string;
  workerEmail?: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: Date;
  rows: DayTicketEntry[];
  options: DayTicketOptions;
  shiftSummary?: DayTicketShiftSummary;
  loadouts?: WorkerDailyLoadout[];
  settings?: TenantSettingsRecord | null;
}): string {
  const downTimeMinutes = (input.shiftSummary?.pauseMinutes ?? 0) + dayTicketDownTimeMinutes(input.rows);
  const totalMinutes = dayTicketTotalMinutes(input.rows, input.shiftSummary);
  const firstStart = input.shiftSummary?.clockIn;
  const lastFinish = input.shiftSummary?.clockOut;
  const clockSessions = input.shiftSummary?.entries ?? [];
  const rowSlots = Array.from({ length: Math.max(10, input.rows.length) }, (_, index) => input.rows[index]);
  const brand = tenantBrand(input.settings);
  const rangeLabel = ticketDateLabel(input.dateFrom, input.dateTo);
  const workOrderLabel = dayTicketWorkOrderLabeler(input.rows, input.dateFrom || input.dateTo);
  const loadouts = (input.loadouts ?? []).filter(hasLoadoutDetails);
  const primaryVehicle = loadouts.length === 1 ? loadouts[0] : undefined;
  return `<!doctype html>
<html>
<head>
  <title>Day Ticket - ${escapeHtml(input.workerName)} - ${escapeHtml(rangeLabel)}</title>
  <style>
    /* Author-defined margin boxes replace the browser's own header/footer (about:blank, date, title) and give real page numbers. */
    @page {
      margin: 12mm;
      size: letter portrait;
      @top-left { content: ''; }
      @top-center { content: ''; }
      @top-right { color: #475569; content: 'Page ' counter(page) ' of ' counter(pages); font: 800 9px Arial, sans-serif; letter-spacing: .06em; text-transform: uppercase; }
      @bottom-left { content: ''; }
      @bottom-center { content: ''; }
      @bottom-right { content: ''; }
    }
    * { box-sizing: border-box; }
    body { color: #111827; font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.3; margin: 0; }
    .sheet { border: 2px solid #334155; box-decoration-break: clone; -webkit-box-decoration-break: clone; min-height: 252mm; padding: 16px; }
    header { align-items: center; border-bottom: 2px solid #334155; display: grid; grid-template-columns: 1fr auto; gap: 24px; margin-bottom: 14px; padding-bottom: 12px; }
    .brand-wrap { align-items: center; display: flex; gap: 14px; min-width: 0; }
    .logo { display: block; flex: none; height: 60px; max-width: 180px; object-fit: contain; object-position: left center; width: auto; }
    .brand-text { min-width: 0; }
    .brand { font-size: 20px; font-weight: 800; letter-spacing: .03em; line-height: 1.15; text-transform: uppercase; }
    .subbrand { color: #475569; font-size: 11px; font-weight: 700; line-height: 1.3; margin-top: 4px; }
    .title-block { text-align: right; }
    h1 { font-size: 26px; letter-spacing: .08em; line-height: 1; margin: 0; white-space: nowrap; }
    .fields { align-items: end; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin: 12px 0; }
    .field { align-items: end; display: grid; grid-template-columns: auto 1fr; gap: 8px; }
    .field span { font-size: 10pt; font-weight: 800; }
    .fields .line { color: #0f172a; font-size: 11pt; font-weight: 700; line-height: 1.25; min-height: 22pt; overflow-wrap: anywhere; }
    .date-field { justify-self: end; max-width: 360px; width: 100%; }
    .date-field .line { text-align: right; }
    .line { border-bottom: 1px solid #111827; min-height: 20px; padding: 0 6px 2px; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th, td { border: 1px solid #334155; overflow-wrap: anywhere; padding: 5pt 6pt; vertical-align: top; }
    th { background: #f8fafc; font-size: 8pt; font-weight: 800; line-height: 1.2; text-align: center; }
    td { font-size: 8.5pt; height: 28pt; line-height: 1.3; }
    .time { text-align: center; width: 92px; }
    .client { width: 160px; }
    .total { text-align: center; width: 62px; }
    .desc { width: auto; }
    .wo-number { font-size: 8pt; font-weight: 800; margin-top: 3pt; }
    .muted { color: #64748b; font-size: 7.5pt; font-weight: 600; line-height: 1.3; margin-top: 2pt; }
    .entry-kind { border: 1px solid #cbd5e1; border-radius: 999px; color: #0f766e; display: inline-block; font-size: 6.8pt; font-weight: 800; line-height: 1.2; margin: 0 4pt 3pt 0; padding: 1pt 4pt; text-transform: uppercase; }
    .entry-kind.travel { color: #0369a1; }
    .entry-kind.route-stop { color: #7c2d12; }
    .entry-kind.worker-activity { color: #6d28d9; }
    .notes { border: 1px solid #334155; border-top: 0; box-decoration-break: clone; -webkit-box-decoration-break: clone; min-height: 128px; padding: 10px 12px; }
    .notes-title { border-bottom: 1px solid #cbd5e1; font-size: 9pt; font-weight: 800; letter-spacing: .06em; margin-bottom: 6px; padding-bottom: 6px; }
    .note-row { align-items: baseline; border-bottom: 1px dashed #e2e8f0; display: grid; grid-template-columns: 112px 120px 1fr; gap: 12px; padding: 5px 0; }
    .note-row:last-child { border-bottom: 0; }
    .note-ref { font-weight: 800; white-space: nowrap; }
    .note-ref small { color: #475569; display: block; font-size: 7.5pt; font-weight: 600; margin-top: 2px; white-space: normal; }
    .note-kind { color: #475569; font-size: 7.5pt; font-weight: 800; text-transform: uppercase; }
    .note-kind small { color: #64748b; display: block; font-size: 7.5pt; font-weight: 600; margin-top: 1px; text-transform: none; }
    .note-text { font-size: 8.5pt; font-weight: 400; line-height: 1.4; overflow-wrap: anywhere; }
    .notes-empty { color: #64748b; font-size: 8pt; font-weight: 600; padding: 6px 0; }
    .loadout { border: 1px solid #334155; border-top: 0; padding: 10px 12px; }
    .loadout-title { border-bottom: 1px solid #cbd5e1; font-size: 9pt; font-weight: 800; letter-spacing: .06em; margin-bottom: 8px; padding-bottom: 6px; }
    .loadout-day { margin-top: 10px; }
    .loadout-day:first-of-type { margin-top: 0; }
    .loadout-date { color: #0f766e; font-size: 8pt; font-weight: 800; margin-bottom: 5px; text-transform: uppercase; }
    .loadout-groups { display: grid; gap: 8px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .loadout-group { background: #f8fafc; border: 1px solid #cbd5e1; min-width: 0; padding: 7px 8px; }
    .loadout-group h3 { font-size: 7pt; letter-spacing: .06em; margin: 0 0 5px; text-transform: uppercase; }
    .loadout-row { border-top: 1px solid #e2e8f0; font-size: 7.5pt; line-height: 1.35; overflow-wrap: anywhere; padding: 4px 0; }
    .loadout-row:first-of-type { border-top: 0; padding-top: 0; }
    .loadout-row strong { font-size: 8pt; }
    .loadout-meta { color: #64748b; font-size: 7pt; margin-top: 1px; }
    .footer { align-items: end; display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 20px; }
    .vehicle { align-items: end; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-top: 18px; }
    .footer span, .vehicle span { color: #475569; display: block; font-size: 7pt; font-weight: 800; letter-spacing: .06em; margin-bottom: 4px; text-transform: uppercase; }
    .footer .line, .vehicle .line { font-size: 9pt; font-weight: 700; line-height: 1.25; min-height: 20pt; padding: 0 2px 3px; }
    .clock-sessions { border-top: 1px solid #cbd5e1; display: grid; gap: 4px; margin-top: 12px; padding-top: 8px; }
    .clock-session-row { align-items: center; display: grid; grid-template-columns: 70px 1fr 1fr 70px; gap: 8px; }
    .clock-session-row span { color: #475569; font-size: 7pt; font-weight: 800; text-transform: uppercase; }
    .adjusted-badge { color: #b45309; display: inline-block; font-size: 8px; font-weight: 800; margin-left: 4px; text-transform: uppercase; }
    .schedule-fallback { color: #92400e; display: block; font-size: 8px; font-weight: 800; margin-top: 1px; text-transform: uppercase; }
    .override-badge { color: #b45309; display: block; font-size: 8px; font-weight: 800; margin-top: 1px; text-transform: uppercase; }
    .hint { color: #475569; font-size: 7pt; font-weight: 600; margin-top: 16px; text-align: center; }
    .legend { color: #92400e; font-size: 9px; font-weight: 800; margin: 6px 0 12px; text-align: left; text-transform: uppercase; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .sheet { break-after: avoid; }
      tr, .note-row, .loadout-group, .footer, .vehicle, header, .fields { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header>
      <div class="brand-wrap">
        ${brand.logoUrl ? `<img class="logo" src="${escapeAttribute(brand.logoUrl)}" alt="${escapeAttribute(brand.name)} logo">` : ''}
        ${brand.name || brand.address ? `<div class="brand-text">
          ${brand.name ? `<div class="brand">${escapeHtml(brand.name)}</div>` : ''}
          ${brand.address ? `<div class="subbrand">${escapeHtml(brand.address)}</div>` : ''}
        </div>` : ''}
      </div>
      <div class="title-block">
        <h1>DAY TICKET</h1>
      </div>
    </header>

    <section class="fields">
      <div class="field"><span>Worker Name:</span><div class="line">${escapeHtml(input.workerName)}</div></div>
      <div class="field date-field"><span>Date:</span><div class="line">${escapeHtml(rangeLabel)}</div></div>
    </section>

    <table>
      <thead>
        <tr>
          <th class="time">Clock<br>In</th>
          <th class="time">Clock<br>Out</th>
          <th class="client">Client</th>
          <th class="desc">Job Description</th>
          <th class="total">Total<br>Time</th>
        </tr>
      </thead>
      <tbody>
        ${rowSlots.map((row) => row ? `
          <tr>
            <td class="time">${escapeHtml(ticketTimeLabel(row.timeIn, input.dateFrom, input.dateTo, ''))}${row.timeInFromSchedule ? '<span class="schedule-fallback">scheduled*</span>' : ''}${row.assignment?.timingOverride ? '<span class="override-badge">override</span>' : ''}</td>
            <td class="time">${escapeHtml(ticketTimeLabel(row.timeOut, input.dateFrom, input.dateTo, ''))}${row.timeOutFromSchedule ? '<span class="schedule-fallback">scheduled*</span>' : ''}${row.assignment?.timingOverride ? '<span class="override-badge">override</span>' : ''}</td>
            <td class="client">${escapeHtml(dayTicketClient(row))}<div class="muted">${escapeHtml(dayTicketClientMeta(row))}</div>${workOrderLabel(row) ? `<div class="wo-number">${escapeHtml(workOrderLabel(row))}</div>` : ''}</td>
            <td class="desc">
              <span class="entry-kind ${escapeAttribute(row.rowType.toLowerCase().replaceAll('_', '-'))}">${escapeHtml(dayTicketRowTypeLabel(row))}</span>
              ${escapeHtml(dayTicketDescription(row, input.options))}
              ${row.rowType === 'TRAVEL' ? '<div class="muted">Sequence: travel started -> arrived on site / work started</div>' : ''}
              ${row.timingWarning ? `<div class="override-badge">${escapeHtml(row.timingWarning)}</div>` : ''}
              ${row.rowType === 'ROUTE_STOP' && input.options.includeStatus ? `<div class="muted">${escapeHtml(routeStopStatusLabel(row.routeStop))}</div>` : ''}
              ${row.rowType === 'WORKER_ACTIVITY' && input.options.includeStatus ? `<div class="muted">${escapeHtml(row.activity?.open ? 'active' : 'completed')}</div>` : ''}
            </td>
            <td class="total">${escapeHtml(minutesLabel(row.minutes))}</td>
          </tr>
        ` : `
          <tr>
            <td class="time"></td><td class="time"></td><td class="client"></td><td class="desc"></td><td class="total"></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    ${input.settings?.dayTicketShowDailyLoadout === true && loadouts.length ? dayTicketLoadoutHtml(loadouts) : ''}

    ${input.options.includeWorkerNotes ? `
      <section class="notes">
        <div class="notes-title">SPECIAL NOTES</div>
        ${dayTicketSpecialNotes(input.rows, workOrderLabel)}
      </section>
    ` : ''}
    ${input.rows.some((row) => row.timeInFromSchedule || row.timeOutFromSchedule) ? '<p class="legend">* Scheduled fallback used because actual worker timing was not captured.</p>' : ''}
    ${input.rows.some((row) => row.assignment?.timingOverride) ? '<p class="legend">Override indicates operations corrected worker field timing.</p>' : ''}

    ${input.options.includeTotals ? `
      <section class="footer">
        <div><span>Clock-in</span><div class="line">${escapeHtml(timeOnly(firstStart, ''))}</div></div>
        <div><span>Clock-out</span><div class="line">${escapeHtml(timeOnly(lastFinish, ''))}</div></div>
        <div><span>Down Time</span><div class="line">${escapeHtml(downTimeMinutes ? minutesLabel(downTimeMinutes) : '')}</div></div>
        <div><span>Total Time</span><div class="line">${escapeHtml(minutesLabel(totalMinutes))}</div></div>
      </section>
      ${clockSessions.length ? `
        <section class="clock-sessions">
          <strong>Clock sessions</strong>
          ${clockSessions.map((entry, index) => `
            <div class="clock-session-row">
              <span>Session ${index + 1}${entry.override ? '<em class="adjusted-badge">adjusted</em>' : ''}</span>
              <div>Clock-in: ${escapeHtml(shortDateTime(entry.startedAt))}</div>
              <div>Clock-out: ${escapeHtml(entry.endedAt ? shortDateTime(entry.endedAt) : 'Active')}</div>
              <strong>${escapeHtml(minutesLabel(Math.max(0, (entry.durationMinutes ?? minutesBetween(entry.startedAt, entry.endedAt)) - (entry.pauseMinutes ?? 0))))}</strong>
            </div>
            ${entry.overrideReason ? `<div class="muted">Session ${index + 1} adjustment: ${escapeHtml(entry.overrideReason)}</div>` : ''}
            ${(entry.pauseMinutes ?? 0) > 0 ? `<div class="muted">Session ${index + 1} pause: ${escapeHtml(minutesLabel(entry.pauseMinutes ?? 0))}</div>` : ''}
          `).join('')}
        </section>
      ` : ''}
      <section class="vehicle">
        <div><span>Vehicle</span><div class="line">${escapeHtml(primaryVehicle ? loadoutVehicleLabel(primaryVehicle) : loadouts.length > 1 ? 'Multiple vehicles' : '')}</div></div>
        <div><span>Mileage Start</span><div class="line">${escapeHtml(primaryVehicle?.vehicleUse?.startKm?.toString() ?? '')}</div></div>
        <div><span>Mileage End</span><div class="line">${escapeHtml(primaryVehicle?.vehicleUse?.endKm?.toString() ?? '')}</div></div>
      </section>
    ` : ''}

    <p class="hint">Generated ${escapeHtml(new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(input.generatedAt))}${input.workerEmail ? ` · ${escapeHtml(input.workerEmail)}` : ''}${brand.contact ? ` · ${escapeHtml(brand.contact)}` : ''}</p>
  </main>
</body>
</html>`;
}

export function dateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dayTicketShiftSummary(entries: WorkerClockEntryRecord[]): DayTicketShiftSummary {
  const sortedEntries = [...entries].sort((left, right) => dateValue(left.startedAt) - dateValue(right.startedAt));
  const clockIn = earliest(sortedEntries.map((entry) => entry.startedAt));
  const clockOut = latest(sortedEntries.map((entry) => entry.endedAt));
  const minutes = sortedEntries.reduce((total, entry) => total + (entry.durationMinutes ?? minutesBetween(entry.startedAt, entry.endedAt)), 0);
  const pauseMinutes = sortedEntries.reduce((total, entry) => total + (entry.pauseMinutes ?? 0), 0);
  return { clockIn, clockOut, minutes, pauseMinutes, entries: sortedEntries };
}

export function dayTicketEstimatedTravelMinutes(entry: DayTicketEntry): number | undefined {
  if (entry.rowType === 'TRAVEL') {
    return entry.assignment?.estimatedTravelMinutes;
  }
  if (entry.rowType === 'ROUTE_STOP') {
    return entry.routeStop?.estimatedTravelMinutes;
  }
  return undefined;
}

export function dayTicketEstimatedTravelLabel(entry: DayTicketEntry): string {
  const minutes = dayTicketEstimatedTravelMinutes(entry);
  if (typeof minutes !== 'number' || minutes <= 0) {
    return '-';
  }
  return `${minutesLabel(minutes)} ${dayTicketEstimateProviderLabel(entry)}`;
}

export function timeOnly(value?: string, fallback = '-'): string {
  return value ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : fallback;
}

export function ticketTimeLabel(value: string | undefined, dateFrom: string, dateTo: string, fallback = '-'): string {
  if (!value) {
    return fallback;
  }
  return dateFrom && dateTo && dateFrom !== dateTo ? shortDateTime(value) : timeOnly(value, fallback);
}

export function minutesLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function dateRangeLabel(from: string, to: string): string {
  if (!from && !to) {
    return '';
  }
  const format = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(localDate(value));
  if (from && to) {
    return `Date range ${format(from)} - ${format(to)}`;
  }
  return from ? `From ${format(from)}` : `Through ${format(to)}`;
}

function actualTimingFor(workOrder: WorkOrderRecord, reportType: ReportType, targetId: string): ActualTiming {
  const assignments = reportType === 'WORKER'
    ? workOrder.assignments.filter((assignment) => assignment.workerId === targetId)
    : workOrder.assignments;
  const arrivedAt = earliest(assignments.map((assignment) => assignment.actualArrivedAt));
  const finishedAt = latest(assignments.map((assignment) => assignment.actualFinishedAt));
  const minutes = assignments.reduce((total, assignment) => total + (assignment.actualWorkMinutes ?? 0), 0);
  const override = assignments.find((assignment) => assignment.timingOverride);
  return { arrivedAt, finishedAt, minutes, overridden: Boolean(override), overrideReason: override?.overrideReason };
}

function dateValue(value?: string): number {
  if (!value) {
    return 0;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function matchesDateRange(workOrder: WorkOrderRecord, from: string, to: string): boolean {
  if (!from && !to) {
    return true;
  }
  const value = reportDateValue(workOrder);
  if (!value) {
    return false;
  }
  const day = startOfDay(value).getTime();
  if (from && day < localDate(from).getTime()) {
    return false;
  }
  if (to && day > localDate(to).getTime()) {
    return false;
  }
  return true;
}

function dateInRange(value: string | undefined, from: string, to: string): boolean {
  if (!value) {
    return false;
  }
  const day = startOfDay(value).getTime();
  if (from && day < localDate(from).getTime()) {
    return false;
  }
  if (to && day > localDate(to).getTime()) {
    return false;
  }
  return true;
}

function reportDateValue(workOrder: WorkOrderRecord): string | undefined {
  return workOrder.scheduledStart
    || earliest(workOrder.assignments.map((assignment) => assignment.actualTravelStartedAt))
    || earliest(workOrder.assignments.map((assignment) => assignment.actualArrivedAt))
    || earliest(workOrder.assignments.map((assignment) => assignment.actualWorkStartedAt))
    || earliest(workOrder.assignments.map((assignment) => assignment.actualFinishedAt));
}

function localDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function startOfDay(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayTicketTiming(workOrder: WorkOrderRecord, assignment: WorkOrderAssignment, useActualTiming: boolean): Pick<DayTicketEntry, 'timeIn' | 'timeOut' | 'timeInFromSchedule' | 'timeOutFromSchedule' | 'minutes'> {
  const actualTimeIn = assignment.actualArrivedAt || assignment.actualWorkStartedAt;
  const actualTimeOut = assignment.actualFinishedAt;
  const timeIn = useActualTiming
    ? actualTimeIn || workOrder.scheduledStart
    : workOrder.scheduledStart || actualTimeIn;
  const timeOut = useActualTiming
    ? actualTimeOut || workOrder.scheduledEnd
    : workOrder.scheduledEnd || actualTimeOut;
  const timeInFromSchedule = useActualTiming && !actualTimeIn && timeIn === workOrder.scheduledStart;
  const timeOutFromSchedule = useActualTiming && !actualTimeOut && timeOut === workOrder.scheduledEnd;
  const displayedMinutes = minutesBetween(timeIn, timeOut);
  const minutes = displayedMinutes || assignment.actualWorkMinutes || 0;
  return { timeIn, timeOut, timeInFromSchedule, timeOutFromSchedule, minutes };
}

function dayTicketRouteStopTiming(stop: WorkOrderRecord['routeStops'][number], useActualTiming: boolean): Pick<DayTicketEntry, 'timeIn' | 'timeOut' | 'timeInFromSchedule' | 'timeOutFromSchedule' | 'minutes'> {
  const actualTimeIn = stop.arrivedAt;
  const actualTimeOut = stop.completedAt || stop.skippedAt;
  const timeIn = useActualTiming
    ? actualTimeIn || stop.plannedArrival
    : stop.plannedArrival || actualTimeIn;
  const timeOut = useActualTiming
    ? actualTimeOut || stop.plannedArrival
    : stop.plannedArrival || actualTimeOut;
  const timeInFromSchedule = useActualTiming && !actualTimeIn && timeIn === stop.plannedArrival;
  const timeOutFromSchedule = useActualTiming && !actualTimeOut && timeOut === stop.plannedArrival;
  return { timeIn, timeOut, timeInFromSchedule, timeOutFromSchedule, minutes: minutesBetween(timeIn, timeOut) };
}

function dayTicketTravelTiming(assignment: WorkOrderAssignment): Pick<DayTicketEntry, 'timeIn' | 'timeOut' | 'timeInFromSchedule' | 'timeOutFromSchedule' | 'minutes' | 'timingWarning'> | null {
  const timeIn = assignment.actualTravelStartedAt;
  const candidateTimeOut = assignment.actualArrivedAt || assignment.actualWorkStartedAt;
  const timeOut = isSameOrAfter(candidateTimeOut, timeIn) ? candidateTimeOut : undefined;
  const timingWarning = candidateTimeOut && !timeOut
    ? 'Timing discrepancy: arrival/work start is before travel start'
    : undefined;
  if (!timeIn) {
    return null;
  }
  return {
    timeIn,
    timeOut,
    timeInFromSchedule: false,
    timeOutFromSchedule: false,
    minutes: minutesBetween(timeIn, timeOut),
    timingWarning
  };
}

function isSameOrAfter(value?: string, floor?: string): boolean {
  if (!value || !floor) {
    return false;
  }
  const valueTime = new Date(value).getTime();
  const floorTime = new Date(floor).getTime();
  return !Number.isNaN(valueTime) && !Number.isNaN(floorTime) && valueTime >= floorTime;
}

function routeStopTypeLabel(stopType: string): string {
  return stopType.toLowerCase().replaceAll('_', ' ');
}

function routeStopStatusLabel(stop?: WorkOrderRecord['routeStops'][number]): string {
  if (!stop) {
    return 'route stop';
  }
  if (stop.skippedAt) {
    return `skipped${stop.skippedReason ? `: ${stop.skippedReason}` : ''}`;
  }
  if (stop.completedAt) {
    return 'completed';
  }
  if (stop.arrivedAt) {
    return 'arrived';
  }
  return 'planned';
}

function activityTypeLabel(activityType: string): string {
  return activityType.toLowerCase().replaceAll('_', ' ');
}

function dayTicketClient(row: DayTicketEntry): string {
  if (row.rowType === 'WORKER_ACTIVITY') {
    return row.activity?.locationName || row.activity?.title || 'Worker activity';
  }
  if (row.rowType === 'TRAVEL') {
    return row.workOrder?.propertyName || 'Travel';
  }
  if (row.rowType === 'ROUTE_STOP') {
    return row.routeStop?.name || 'Route stop';
  }
  return row.workOrder?.propertyName || '';
}

function dayTicketClientMeta(row: DayTicketEntry): string {
  if (row.rowType === 'WORKER_ACTIVITY') {
    return activityTypeLabel(row.activity?.activityType || 'OTHER');
  }
  if (row.rowType === 'TRAVEL') {
    return 'travel';
  }
  if (row.rowType === 'ROUTE_STOP') {
    return routeStopTypeLabel(row.routeStop?.stopType || 'OTHER');
  }
  return row.workOrder?.ownerName || '';
}

// Day-ticket-only W.O labels (YYMMDD-0001), numbered per day in row order.
// Rows for the same work order on the same day share one label; rows without a work order get ''.
export function dayTicketWorkOrderLabeler(rows: DayTicketEntry[], fallbackDate: string): (row: DayTicketEntry) => string {
  const keyOf = (row: DayTicketEntry): { day: string; key: string } | undefined => {
    if (!row.workOrder) {
      return undefined;
    }
    const when = row.timeIn || row.workOrder.scheduledStart;
    const day = (when ? dateInputValue(new Date(when)) : fallbackDate || dateInputValue(new Date())).replaceAll('-', '').slice(2);
    return { day, key: `${day}|${row.workOrder.id}` };
  };
  const labels = new Map<string, string>();
  const dayCounters = new Map<string, number>();
  for (const row of rows) {
    const ref = keyOf(row);
    if (!ref || labels.has(ref.key)) {
      continue;
    }
    const next = (dayCounters.get(ref.day) ?? 0) + 1;
    dayCounters.set(ref.day, next);
    labels.set(ref.key, `${ref.day}-${String(next).padStart(4, '0')}`);
  }
  return (row) => {
    const ref = keyOf(row);
    return ref ? labels.get(ref.key) ?? '' : '';
  };
}

function dayTicketEstimateProviderLabel(entry: DayTicketEntry): string {
  const provider = entry.rowType === 'TRAVEL'
    ? entry.assignment?.travelEstimateProvider
    : entry.routeStop?.travelEstimateProvider;
  return provider ? provider.toLowerCase().replaceAll('_', ' ') : 'Map';
}

function dayTicketDownTimeMinutes(rows: DayTicketEntry[]): number {
  return rows
    .filter((row) => row.rowType === 'WORKER_ACTIVITY' && row.activity?.activityType === 'BREAK')
    .reduce((total, row) => total + row.minutes, 0);
}

function rowSortTime(row: DayTicketEntry): string | undefined {
  return row.timeIn || row.workOrder?.scheduledStart || row.activity?.startedAt || row.routeStop?.plannedArrival;
}

function dayTicketSpecialNotes(rows: DayTicketEntry[], workOrderLabel: (row: DayTicketEntry) => string): string {
  const notes = [
    ...dayTicketWorkerNotes(rows, workOrderLabel),
    ...dayTicketActivityNotes(rows),
    ...dayTicketOverrideNotes(rows, workOrderLabel)
  ];
  return notes.length ? notes.join('') : '<p class="notes-empty">No special notes recorded for this ticket.</p>';
}

function dayTicketNoteRow(ref: string, belongsTo: string, kind: string, text: string, when?: string): string {
  return `<div class="note-row"><span class="note-ref">${escapeHtml(ref)}${belongsTo ? `<small>${escapeHtml(belongsTo)}</small>` : ''}</span><span class="note-kind">${escapeHtml(kind)}${when ? `<small>${escapeHtml(when)}</small>` : ''}</span><span class="note-text">${escapeHtml(text)}</span></div>`;
}

function dayTicketWorkerNotes(rows: DayTicketEntry[], workOrderLabel: (row: DayTicketEntry) => string): string[] {
  const renderedWorkOrders = new Set<string>();
  const notes: string[] = [];
  for (const row of rows) {
    const workOrder = row.workOrder;
    const assignment = row.assignment;
    if (!workOrder || !assignment || renderedWorkOrders.has(workOrder.id)) {
      continue;
    }
    renderedWorkOrders.add(workOrder.id);
    const workerNotes = (workOrder.fieldNotes ?? [])
      .filter((note) => !note.workerId || note.workerId === assignment.workerId)
      .map((note) => dayTicketNoteRow(workOrderLabel(row), dayTicketClient(row), 'Field note', note.note, note.createdAt ? shortDateTime(note.createdAt) : undefined));
    notes.push(...workerNotes);
    if (workerNotes.length === 0 && assignment.notes) {
      notes.push(dayTicketNoteRow(workOrderLabel(row), dayTicketClient(row), 'Worker note', assignment.notes));
    }
  }
  return notes;
}

function dayTicketActivityNotes(rows: DayTicketEntry[]): string[] {
  return rows
    .filter((row) => row.rowType === 'WORKER_ACTIVITY' && row.activity?.notes)
    .map((row) => dayTicketNoteRow('-', dayTicketClient(row), activityTypeLabel(row.activity?.activityType || 'OTHER'), row.activity?.notes || '', row.timeIn ? shortDateTime(row.timeIn) : undefined));
}

function dayTicketOverrideNotes(rows: DayTicketEntry[], workOrderLabel: (row: DayTicketEntry) => string): string[] {
  const rendered = new Set<string>();
  const notes: string[] = [];
  for (const row of rows) {
    if (!row.assignment?.timingOverride || !row.workOrder || rendered.has(row.workOrder.id)) {
      continue;
    }
    rendered.add(row.workOrder.id);
    notes.push(dayTicketNoteRow(workOrderLabel(row), dayTicketClient(row), 'Override', row.assignment.overrideReason || 'Timing corrected by operations'));
  }
  return notes;
}

function ticketDateLabel(from: string, to: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: '2-digit', day: '2-digit', year: 'numeric' });
  if (from && to && from !== to) {
    return `${formatter.format(localDate(from))} - ${formatter.format(localDate(to))}`;
  }
  return formatter.format(localDate(from || to || dateInputValue(new Date())));
}

function hasLoadoutDetails(loadout: WorkerDailyLoadout): boolean {
  const vehicle = loadout.vehicleUse;
  return Boolean(
    vehicle?.vehicleAssetId
    || vehicle?.vehicleLabel
    || vehicle?.startKm != null
    || vehicle?.endKm != null
    || vehicle?.notes
    || loadout.tools?.length
    || loadout.materials?.length
  );
}

function loadoutVehicleLabel(loadout: WorkerDailyLoadout): string {
  const use = loadout.vehicleUse;
  if (!use) {
    return '';
  }
  if (use.vehicleLabel) {
    return use.vehicleLabel;
  }
  const vehicle = loadout.vehicles?.find((item) => item.id === use.vehicleAssetId);
  return vehicle ? [vehicle.name, vehicle.identifier].filter(Boolean).join(' - ') : '';
}

function dayTicketLoadoutHtml(loadouts: WorkerDailyLoadout[]): string {
  return `
    <section class="loadout">
      <div class="loadout-title">DAILY LOADOUT</div>
      ${loadouts.map((loadout) => {
        const use = loadout.vehicleUse;
        const vehicleLabel = loadoutVehicleLabel(loadout);
        const distance = use?.startKm != null && use?.endKm != null
          ? Math.max(0, Number(use.endKm) - Number(use.startKm))
          : undefined;
        const vehicleRows = vehicleLabel || use?.startKm != null || use?.endKm != null || use?.notes
          ? `<div class="loadout-row">
              <strong>${escapeHtml(vehicleLabel || 'Vehicle use')}</strong>
              <div class="loadout-meta">${escapeHtml([
                use?.startKm != null ? `Start ${use.startKm} km` : '',
                use?.endKm != null ? `End ${use.endKm} km` : '',
                distance != null ? `${formatLoadoutQuantity(distance)} km travelled` : ''
              ].filter(Boolean).join(' · '))}</div>
              ${use?.notes ? `<div>${escapeHtml(use.notes)}</div>` : ''}
            </div>`
          : '<div class="loadout-row loadout-meta">No vehicle use recorded.</div>';
        const toolRows = loadout.tools?.length
          ? loadout.tools.map((tool) => `
              <div class="loadout-row">
                <strong>${escapeHtml(tool.name)}${tool.identifier ? ` · ${escapeHtml(tool.identifier)}` : ''}</strong>
                <div class="loadout-meta">${escapeHtml(statusLabel(tool.status))} · ${escapeHtml(tool.workOrderNumber)} · ${escapeHtml(tool.propertyName)}</div>
                ${tool.issueNote ? `<div>${escapeHtml(tool.issueNote)}</div>` : ''}
              </div>
            `).join('')
          : '<div class="loadout-row loadout-meta">No equipment assigned.</div>';
        const materialRows = loadout.materials?.length
          ? loadout.materials.map((material) => `
              <div class="loadout-row">
                <strong>${escapeHtml(material.itemName || material.description || 'Material')}</strong>
                <div class="loadout-meta">${escapeHtml(`${formatLoadoutQuantity(material.quantity)}${material.unit ? ` ${material.unit}` : ''} · ${material.used ? 'used' : 'planned'} · ${material.workOrderNumber}`)}</div>
                <div>${escapeHtml(material.propertyName)}</div>
              </div>
            `).join('')
          : '<div class="loadout-row loadout-meta">No materials recorded.</div>';
        return `
          <div class="loadout-day">
            <div class="loadout-date">${escapeHtml(longDateLabel(loadout.date))}</div>
            <div class="loadout-groups">
              <div class="loadout-group"><h3>Vehicle</h3>${vehicleRows}</div>
              <div class="loadout-group"><h3>Tools and equipment</h3>${toolRows}</div>
              <div class="loadout-group"><h3>Materials</h3>${materialRows}</div>
            </div>
          </div>
        `;
      }).join('')}
    </section>
  `;
}

function formatLoadoutQuantity(value: number): string {
  return new Intl.NumberFormat('en-CA', { maximumFractionDigits: 2 }).format(Number(value));
}

function longDateLabel(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(`${value}T12:00:00`));
}

function tenantBrand(settings?: TenantSettingsRecord | null): { name: string; address: string; contact: string; logoUrl: string } {
  const showName = settings?.dayTicketShowCompanyName !== false;
  const showAddress = settings?.dayTicketShowCompanyAddress !== false;
  const name = showName ? firstNonBlank(settings?.organizationName, settings?.tenantName, settings?.legalName, 'Property Services') : '';
  return {
    name,
    address: showAddress ? tenantAddress(settings) : '',
    contact: firstNonBlank(settings?.billingEmail, settings?.supportEmail, settings?.phone),
    logoUrl: absoluteAssetUrl(settings?.logoUrl || '')
  };
}

function tenantAddress(settings?: TenantSettingsRecord | null): string {
  const addressParts = [settings?.addressLine1, settings?.addressLine2, settings?.city, settings?.provinceCode, settings?.postalCode];
  if (!addressParts.some((value) => value?.trim())) {
    return '';
  }
  return joinText(', ', ...addressParts, settings?.countryCode);
}

function firstNonBlank(...values: Array<string | undefined>): string {
  return values.find((value) => value && value.trim())?.trim() || '';
}

function joinText(delimiter: string, ...values: Array<string | undefined>): string {
  return values
    .map((value) => value?.trim() || '')
    .filter(Boolean)
    .join(delimiter);
}

function absoluteAssetUrl(value: string): string {
  if (!value) {
    return '';
  }
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

function minutesBetween(start?: string, end?: string): number {
  if (!start || !end) {
    return 0;
  }
  const minutes = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function shortDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function earliest(values: Array<string | undefined>): string | undefined {
  return values.filter(Boolean).sort((left, right) => dateValue(left) - dateValue(right))[0];
}

function latest(values: Array<string | undefined>): string | undefined {
  return values.filter(Boolean).sort((left, right) => dateValue(right) - dateValue(left))[0];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

export const closedReportStatuses = new Set(['COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED']);
export const completedReportStatuses = new Set(['COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID']);
