import { Routes } from '@angular/router';
import { authGuard } from './core/services/auth.guard';

export const appRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/tenant-shell.component').then((m) => m.TenantShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'owners',
        loadComponent: () => import('./features/owners/property-owner-page.component').then((m) => m.PropertyOwnerPageComponent)
      },
      {
        path: 'properties',
        loadComponent: () => import('./features/properties/property-page.component').then((m) => m.PropertyPageComponent)
      },
      {
        path: 'services',
        loadComponent: () => import('./features/services/service-catalog-page.component').then((m) => m.ServiceCatalogPageComponent)
      },
      {
        path: 'inventory',
        loadComponent: () => import('./features/inventory/inventory-page.component').then((m) => m.InventoryPageComponent)
      },
      {
        path: 'workers',
        loadComponent: () => import('./features/workers/worker-page.component').then((m) => m.WorkerPageComponent)
      },
      {
        path: 'work-orders',
        loadComponent: () => import('./features/work-orders/work-order-page.component').then((m) => m.WorkOrderPageComponent)
      },
      {
        path: 'schedule',
        loadComponent: () => import('./features/schedule/dispatch-schedule-page.component').then((m) => m.DispatchSchedulePageComponent)
      },
      {
        path: 'work-audit',
        loadComponent: () => import('./features/audit/work-audit-page.component').then((m) => m.WorkAuditPageComponent)
      },
      {
        path: 'users',
        loadComponent: () => import('./features/users/tenant-user-page.component').then((m) => m.TenantUserPageComponent)
      },
      {
        path: 'email-templates',
        loadComponent: () => import('./features/notifications/email-template-page.component').then((m) => m.EmailTemplatePageComponent)
      },
      {
        path: 'invoices',
        loadComponent: () => import('./features/finance/invoice-page.component').then((m) => m.InvoicePageComponent)
      },
      {
        path: 'payments',
        loadComponent: () => import('./shared/pages/tenant-module-placeholder.component').then((m) => m.TenantModulePlaceholderComponent),
        data: {
          section: 'Finance',
          title: 'Payments',
          summary: 'Track owner payments, outstanding balances, refunds, and payment reconciliation.',
          capabilities: ['Payment ledger', 'Open balances', 'Refund tracking', 'Reconciliation queue']
        }
      },
      {
        path: 'finance',
        loadComponent: () => import('./shared/pages/tenant-module-placeholder.component').then((m) => m.TenantModulePlaceholderComponent),
        data: {
          section: 'Finance',
          title: 'Finance overview',
          summary: 'Monitor revenue, margins, material cost, payroll exposure, and overdue receivables.',
          capabilities: ['Revenue dashboard', 'Margin by service', 'Material cost trends', 'Receivables aging']
        }
      },
      {
        path: 'payroll',
        loadComponent: () => import('./shared/pages/tenant-module-placeholder.component').then((m) => m.TenantModulePlaceholderComponent),
        data: {
          section: 'People',
          title: 'Payroll',
          summary: 'Review worker hours, job time capture, approvals, rates, and payroll export readiness.',
          capabilities: ['Worker time review', 'Approval queue', 'Rate exceptions', 'Payroll export']
        }
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/reports/reports-page.component').then((m) => m.ReportsPageComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./shared/pages/tenant-module-placeholder.component').then((m) => m.TenantModulePlaceholderComponent),
        data: {
          section: 'Administration',
          title: 'Tenant settings',
          summary: 'Manage tenant profile, service defaults, billing settings, roles, and notification preferences.',
          capabilities: ['Tenant profile', 'Roles and permissions', 'Notification defaults', 'Billing configuration']
        }
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
