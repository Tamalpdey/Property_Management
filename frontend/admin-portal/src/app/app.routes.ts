import { Routes } from '@angular/router';
import { authGuard } from './core/services/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/admin-login.component').then((m) => m.AdminLoginComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      { path: 'quote-templates', loadComponent: () => import('./features/quote-templates/quote-templates-page.component').then(m => m.QuoteTemplatesPageComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent)
      },
      {
        path: 'tenants/new',
        loadComponent: () => import('./features/tenants/tenant-onboarding-page.component').then((m) => m.TenantOnboardingPageComponent)
      },
      {
        path: 'tenants',
        loadComponent: () => import('./features/tenants/tenant-management-page.component').then((m) => m.TenantManagementPageComponent)
      },
      {
        path: 'tenants/:tenantId/support',
        loadComponent: () => import('./features/tenants/tenant-support-page.component').then((m) => m.TenantSupportPageComponent)
      },
      {
        path: 'audit',
        loadComponent: () => import('./features/tenants/platform-audit-page.component').then((m) => m.PlatformAuditPageComponent)
      },
      {
        path: 'support-tickets',
        loadComponent: () => import('./features/tenants/support-tickets-page.component').then(m => m.SupportTicketsPageComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
