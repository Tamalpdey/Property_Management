import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/services/auth.guard';

export const appRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: '',
    canActivate: [authGuard, roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
    loadComponent: () => import('./layout/tenant-shell.component').then((m) => m.TenantShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      },
      {
        path: 'dashboard',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'owners',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/owners/property-owner-page.component').then((m) => m.PropertyOwnerPageComponent)
      },
      {
        path: 'properties',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/properties/property-page.component').then((m) => m.PropertyPageComponent)
      },
      {
        path: 'services',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/services/service-catalog-page.component').then((m) => m.ServiceCatalogPageComponent)
      },
      {
        path: 'inventory',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/inventory/inventory-page.component').then((m) => m.InventoryPageComponent)
      },
      {
        path: 'workers',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS'])],
        loadComponent: () => import('./features/workers/worker-page.component').then((m) => m.WorkerPageComponent)
      },
      {
        path: 'work-orders',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/work-orders/work-order-page.component').then((m) => m.WorkOrderPageComponent)
      },
      {
        path: 'schedule',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS'])],
        loadComponent: () => import('./features/schedule/dispatch-schedule-page.component').then((m) => m.DispatchSchedulePageComponent)
      },
      {
        path: 'route-intelligence',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS'])],
        loadComponent: () => import('./features/schedule/route-intelligence-page.component').then((m) => m.RouteIntelligencePageComponent)
      },
      {
        path: 'messages',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/messages/messages-page.component').then((m) => m.MessagesPageComponent)
      },
      {
        path: 'work-audit',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/audit/work-audit-page.component').then((m) => m.WorkAuditPageComponent)
      },
      {
        path: 'users',
        canActivate: [roleGuard(['TENANT_ADMIN'])],
        loadComponent: () => import('./features/users/tenant-user-page.component').then((m) => m.TenantUserPageComponent)
      },
      {
        path: 'email-templates',
        canActivate: [roleGuard(['TENANT_ADMIN', 'FINANCE'])],
        loadComponent: () => import('./features/notifications/email-template-page.component').then((m) => m.EmailTemplatePageComponent)
      },
      {
        path: 'email-audit',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/notifications/email-audit-page.component').then((m) => m.EmailAuditPageComponent)
      },
      {
        path: 'invoices',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/finance/invoice-page.component').then((m) => m.InvoicePageComponent)
      },
      {
        path: 'payments',
        canActivate: [roleGuard(['TENANT_ADMIN', 'FINANCE'])],
        loadComponent: () => import('./features/finance/payments-page.component').then((m) => m.PaymentsPageComponent)
      },
      {
        path: 'finance',
        canActivate: [roleGuard(['TENANT_ADMIN', 'FINANCE'])],
        loadComponent: () => import('./features/finance/finance-overview-page.component').then((m) => m.FinanceOverviewPageComponent)
      },
      {
        path: 'payroll',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/payroll/timesheet-page.component').then((m) => m.TimesheetPageComponent)
      },
      {
        path: 'reports',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/reports/reports-page.component').then((m) => m.ReportsPageComponent)
      },
      {
        path: 'reports/builder',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/reports/report-builder-page.component').then((m) => m.ReportBuilderPageComponent)
      },
      {
        path: 'reports/day-ticket',
        canActivate: [roleGuard(['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'])],
        loadComponent: () => import('./features/reports/day-ticket-page.component').then((m) => m.DayTicketPageComponent)
      },
      {
        path: 'settings',
        canActivate: [roleGuard(['TENANT_ADMIN'])],
        loadComponent: () => import('./features/settings/tenant-settings-page.component').then((m) => m.TenantSettingsPageComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
