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
    loadComponent: () => import('./layout/worker-shell.component').then((m) => m.WorkerShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'today'
      },
      {
        path: 'today',
        loadComponent: () => import('./features/today/worker-today.component').then((m) => m.WorkerTodayComponent)
      },
      {
        path: 'activity',
        loadComponent: () => import('./features/activity/worker-activity.component').then((m) => m.WorkerActivityComponent)
      },
      {
        path: 'loadout',
        loadComponent: () => import('./features/loadout/worker-loadout.component').then((m) => m.WorkerLoadoutComponent)
      },
      {
        path: 'day-ticket',
        loadComponent: () => import('./features/day-ticket/worker-day-ticket.component').then((m) => m.WorkerDayTicketComponent)
      },
      {
        path: 'jobs/:id',
        loadComponent: () => import('./features/job-detail/worker-job-detail.component').then((m) => m.WorkerJobDetailComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
