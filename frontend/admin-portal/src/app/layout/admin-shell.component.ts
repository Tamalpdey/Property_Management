import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { filter } from 'rxjs';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'lorne-admin-shell', standalone: true,
  imports: [NgTemplateOutlet, ButtonModule, DrawerModule, RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-shell.component.html', styleUrls: ['./admin-shell.component.scss']
})
export class AdminShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly mobileOpen = signal(false);
  protected readonly currentPath = signal(this.router.url);
  protected readonly user = this.auth.currentUser;
  protected readonly initials = computed(() => (this.user()?.displayName || 'Admin').split(' ').filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase());
  protected readonly sections = [
    { name: 'Workspace', items: [
      { label: 'Dashboard', path: '/dashboard', icon: 'pi pi-chart-bar' },
      { label: 'Tenants', path: '/tenants', icon: 'pi pi-building' },
      { label: 'Support tickets', path: '/support-tickets', icon: 'pi pi-ticket' }
    ] },
    { name: 'Configuration', items: [
      { label: 'Quote templates', path: '/quote-templates', icon: 'pi pi-file-edit' },
      { label: 'Audit log', path: '/audit', icon: 'pi pi-history' }
    ] }
  ];
  protected readonly title = computed(() => this.currentPath().startsWith('/tenants/new') ? 'Onboard tenant'
    : this.currentPath().includes('/support') && this.currentPath().startsWith('/tenants/') ? 'Tenant workspace'
    : this.sections.flatMap(section => section.items).find(item => this.currentPath().startsWith(item.path))?.label || 'Dashboard');
  constructor() {
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => {
      this.currentPath.set(this.router.url); this.mobileOpen.set(false);
    });
  }
  signOut(): void { this.auth.signOut(); location.assign('/login'); }
}
