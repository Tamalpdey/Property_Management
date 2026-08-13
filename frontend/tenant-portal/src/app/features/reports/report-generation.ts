import type { TenantSettingsRecord, WorkerActivityRecord, WorkerClockEntryRecord, WorkOrderRecord } from '@lorne/contracts';
import type { TenantAnalytics } from '../analytics/services/tenant-analytics.service';

export type ReportType = 'WORKER' | 'PROPERTY';

export interface DayTicketOptions {
  useActualTiming: boolean;
  includeStatus: boolean;
  includeService: boolean;
  includeNotes: boolean;
  includeTotals: boolean;
}

export interface DayTicketEntry {
  rowType: 'WORK_ORDER' | 'ROUTE_STOP' | 'WORKER_ACTIVITY';
  workOrder?: WorkOrderRecord;
  assignment?: WorkOrderRecord['assignments'][number];
  timeIn?: string;
  timeOut?: string;
  timeInFromSchedule: boolean;
  timeOutFromSchedule: boolean;
  minutes: number;
  routeStop?: WorkOrderRecord['routeStops'][number];
  activity?: WorkerActivityRecord;
}

export interface DayTicketShiftSummary {
  clockIn?: string;
  clockOut?: string;
  minutes: number;
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
  data: TenantAnalytics;
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

export function selectedReportInvoiceCount(data: TenantAnalytics, rows: WorkOrderRecord[]): number {
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
  invoices: TenantAnalytics['invoices'];
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

export function dayTicketRows(data: TenantAnalytics, workerId: string, dateFrom: string, dateTo: string, options: DayTicketOptions): DayTicketEntry[] {
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

export function dayTicketHtml(input: {
  workerName: string;
  workerEmail?: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: Date;
  rows: DayTicketEntry[];
  options: DayTicketOptions;
  shiftSummary?: DayTicketShiftSummary;
  settings?: TenantSettingsRecord | null;
}): string {
  const totalMinutes = input.rows.reduce((total, row) => total + row.minutes, 0);
  const firstStart = input.shiftSummary?.clockIn;
  const lastFinish = input.shiftSummary?.clockOut;
  const rowSlots = Array.from({ length: Math.max(10, input.rows.length) }, (_, index) => input.rows[index]);
  const brand = tenantBrand(input.settings);
  const rangeLabel = ticketDateLabel(input.dateFrom, input.dateTo);
  return `<!doctype html>
<html>
<head>
  <title>Day Ticket - ${escapeHtml(input.workerName)} - ${escapeHtml(rangeLabel)}</title>
  <style>
    @page { margin: 12mm; size: letter portrait; }
    * { box-sizing: border-box; }
    body { color: #111827; font-family: Arial, sans-serif; font-size: 11px; margin: 0; }
    .sheet { border: 2px solid #334155; min-height: 252mm; padding: 16px; }
    header { align-items: start; display: grid; grid-template-columns: 1fr auto 1fr; gap: 18px; margin-bottom: 16px; }
    .brand-wrap { align-items: center; display: flex; gap: 10px; min-width: 0; }
    .logo { background: #fff; border: 1px solid #cbd5e1; height: 38px; object-fit: contain; padding: 2px; width: 52px; }
    .brand { font-size: 22px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .subbrand { color: #475569; font-size: 11px; font-weight: 700; margin-top: 2px; }
    h1 { font-size: 26px; letter-spacing: .06em; margin: 12px 0 0; text-align: center; }
    .ticket-number { font-size: 14px; font-weight: 800; text-align: right; }
    .fields { align-items: end; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin: 12px 0; }
    .field { align-items: end; display: grid; grid-template-columns: auto 1fr; gap: 8px; }
    .field span { font-size: 14px; font-weight: 700; }
    .line { border-bottom: 1px solid #111827; min-height: 20px; padding: 0 6px 2px; }
    table { border-collapse: collapse; table-layout: fixed; width: 100%; }
    th, td { border: 1px solid #334155; padding: 6px 7px; vertical-align: top; }
    th { background: #f8fafc; font-size: 12px; text-align: center; }
    td { height: 34px; }
    .rownum { text-align: center; width: 30px; }
    .time { text-align: center; width: 72px; }
    .client { width: 160px; }
    .wo { width: 118px; }
    .total { text-align: center; width: 76px; }
    .desc { width: auto; }
    .muted { color: #64748b; font-size: 9px; font-weight: 700; margin-top: 2px; }
    .notes { border: 1px solid #334155; border-top: 0; min-height: 128px; padding: 8px; }
    .notes strong { display: block; font-size: 13px; margin-bottom: 8px; }
    .footer { align-items: end; display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 20px; }
    .footer .line { min-height: 24px; }
    .vehicle { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-top: 18px; }
    .hint { color: #475569; font-size: 10px; font-weight: 700; margin-top: 16px; text-align: center; }
    .schedule-fallback { color: #92400e; display: block; font-size: 8px; font-weight: 800; margin-top: 1px; text-transform: uppercase; }
    .override-badge { color: #b45309; display: block; font-size: 8px; font-weight: 800; margin-top: 1px; text-transform: uppercase; }
    .legend { color: #92400e; font-size: 9px; font-weight: 800; margin: 6px 0 12px; text-align: left; text-transform: uppercase; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .sheet { break-after: avoid; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <header>
      <div>
        <div class="brand-wrap">
          ${brand.logoUrl ? `<img class="logo" src="${escapeAttribute(brand.logoUrl)}" alt="${escapeAttribute(brand.name)} logo">` : ''}
          <div>
            <div class="brand">${escapeHtml(brand.name)}</div>
            ${brand.subtitle ? `<div class="subbrand">${escapeHtml(brand.subtitle)}</div>` : ''}
            ${brand.address ? `<div class="subbrand">${escapeHtml(brand.address)}</div>` : ''}
          </div>
        </div>
      </div>
      <h1>DAY TICKET</h1>
      <div class="ticket-number">Page 1 of 1</div>
    </header>

    <section class="fields">
      <div class="field"><span>Name:</span><div class="line">${escapeHtml(input.workerName)}</div></div>
      <div class="field"><span>Date:</span><div class="line">${escapeHtml(rangeLabel)}</div></div>
    </section>

    <table>
      <thead>
        <tr>
          <th class="rownum"></th>
          <th class="time">Clock<br>In</th>
          <th class="time">Clock<br>Out</th>
          <th class="client">Client</th>
          <th class="wo">W.O #</th>
          <th class="desc">Job Description</th>
          <th class="total">Total<br>Time</th>
        </tr>
      </thead>
      <tbody>
        ${rowSlots.map((row, index) => row ? `
          <tr>
            <td class="rownum">${index + 1}</td>
            <td class="time">${escapeHtml(timeOnly(row.timeIn, ''))}${row.timeInFromSchedule ? '<span class="schedule-fallback">scheduled*</span>' : ''}${row.assignment?.timingOverride ? '<span class="override-badge">override</span>' : ''}</td>
            <td class="time">${escapeHtml(timeOnly(row.timeOut, ''))}${row.timeOutFromSchedule ? '<span class="schedule-fallback">scheduled*</span>' : ''}${row.assignment?.timingOverride ? '<span class="override-badge">override</span>' : ''}</td>
            <td class="client">${escapeHtml(dayTicketClient(row))}<div class="muted">${escapeHtml(dayTicketClientMeta(row))}</div></td>
            <td class="wo">${escapeHtml(dayTicketWorkOrderNumber(row))}</td>
            <td class="desc">
              ${escapeHtml(dayTicketDescription(row, input.options))}
              ${row.rowType === 'WORK_ORDER' && input.options.includeService && row.workOrder?.serviceName ? `<div class="muted">${escapeHtml(row.workOrder.serviceName)}</div>` : ''}
              ${row.rowType === 'WORK_ORDER' && input.options.includeStatus && row.workOrder ? `<div class="muted">${escapeHtml(statusLabel(row.workOrder.status))}</div>` : ''}
              ${row.rowType === 'ROUTE_STOP' && input.options.includeStatus ? `<div class="muted">${escapeHtml(routeStopStatusLabel(row.routeStop))}</div>` : ''}
              ${row.rowType === 'WORKER_ACTIVITY' && input.options.includeStatus ? `<div class="muted">${escapeHtml(row.activity?.open ? 'active' : 'completed')}</div>` : ''}
            </td>
            <td class="total">${escapeHtml(minutesLabel(row.minutes))}</td>
          </tr>
        ` : `
          <tr>
            <td class="rownum">${index + 1}</td><td class="time"></td><td class="time"></td><td class="client"></td><td class="wo"></td><td class="desc"></td><td class="total"></td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    ${input.options.includeNotes ? `
      <section class="notes">
        <strong>SPECIAL NOTES</strong>
        ${input.rows.map((row) => row.assignment?.notes && row.workOrder ? `<p>${escapeHtml(row.workOrder.workOrderNumber)}: ${escapeHtml(row.assignment.notes)}</p>` : '').join('')}
        ${input.rows.map((row) => row.assignment?.timingOverride && row.workOrder ? `<p><strong>Override:</strong> ${escapeHtml(row.workOrder.workOrderNumber)}${row.assignment.overrideReason ? ` - ${escapeHtml(row.assignment.overrideReason)}` : ''}</p>` : '').join('')}
      </section>
    ` : ''}
    ${input.rows.some((row) => row.timeInFromSchedule || row.timeOutFromSchedule) ? '<p class="legend">* Scheduled fallback used because actual worker timing was not captured.</p>' : ''}
    ${input.rows.some((row) => row.assignment?.timingOverride) ? '<p class="legend">Override indicates operations corrected worker field timing.</p>' : ''}

    ${input.options.includeTotals ? `
      <section class="footer">
        <div><span>Clock-in:</span><div class="line">${escapeHtml(timeOnly(firstStart, ''))}</div></div>
        <div><span>Clock-out:</span><div class="line">${escapeHtml(timeOnly(lastFinish, ''))}</div></div>
        <div><span>Down Time:</span><div class="line"></div></div>
        <div><span>Total Time:</span><div class="line">${escapeHtml(minutesLabel(totalMinutes))}</div></div>
      </section>
      <section class="vehicle">
        <div><span>Vehicle:</span><div class="line"></div></div>
        <div><span>Mileage Start:</span><div class="line"></div></div>
        <div><span>Mileage End:</span><div class="line"></div></div>
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
  const clockIn = earliest(entries.map((entry) => entry.startedAt));
  const clockOut = latest(entries.map((entry) => entry.endedAt));
  const minutes = entries.reduce((total, entry) => total + (entry.durationMinutes ?? minutesBetween(entry.startedAt, entry.endedAt)), 0);
  return { clockIn, clockOut, minutes };
}

export function timeOnly(value?: string, fallback = '-'): string {
  return value ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : fallback;
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
  if (row.rowType === 'ROUTE_STOP') {
    return row.routeStop?.name || 'Route stop';
  }
  return row.workOrder?.propertyName || '';
}

function dayTicketClientMeta(row: DayTicketEntry): string {
  if (row.rowType === 'WORKER_ACTIVITY') {
    return activityTypeLabel(row.activity?.activityType || 'OTHER');
  }
  if (row.rowType === 'ROUTE_STOP') {
    return routeStopTypeLabel(row.routeStop?.stopType || 'OTHER');
  }
  return row.workOrder?.ownerName || '';
}

function dayTicketWorkOrderNumber(row: DayTicketEntry): string {
  if (row.rowType === 'WORKER_ACTIVITY') {
    return 'Worker activity';
  }
  return row.workOrder?.workOrderNumber || '';
}

function rowSortTime(row: DayTicketEntry): string | undefined {
  return row.timeIn || row.workOrder?.scheduledStart || row.activity?.startedAt || row.routeStop?.plannedArrival;
}

function ticketDateLabel(from: string, to: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric' });
  if (from && to && from !== to) {
    return `${formatter.format(localDate(from))} - ${formatter.format(localDate(to))}`;
  }
  return formatter.format(localDate(from || to || dateInputValue(new Date())));
}

function tenantBrand(settings?: TenantSettingsRecord | null): { name: string; subtitle: string; address: string; contact: string; logoUrl: string } {
  const name = firstNonBlank(settings?.organizationName, settings?.tenantName, settings?.legalName, 'Property Services');
  return {
    name,
    subtitle: firstNonBlank(settings?.websiteUrl),
    address: joinText(', ', settings?.addressLine1, settings?.city, settings?.provinceCode, settings?.postalCode, settings?.countryCode),
    contact: firstNonBlank(settings?.billingEmail, settings?.supportEmail, settings?.phone),
    logoUrl: absoluteAssetUrl(settings?.logoUrl || '')
  };
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
