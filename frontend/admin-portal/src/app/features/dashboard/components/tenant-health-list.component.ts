import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { SuperAdminOverviewResponse } from '@lorne/contracts';
import { TenantAccessButtonComponent } from '../../tenants/tenant-access-button.component';

@Component({
  selector: 'lorne-tenant-health-list', standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, TenantAccessButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tenant-health-list.component.html', styleUrls: ['./tenant-health-list.component.scss']
})
export class TenantHealthListComponent {
  readonly tenants = input.required<SuperAdminOverviewResponse['tenantHealth']>();
  readonly changed = output<void>();
  protected readonly query = signal('');
  protected readonly filtered = computed(() => this.tenants().filter(tenant => (tenant.tenantName + ' ' + tenant.subdomain).toLowerCase().includes(this.query().trim().toLowerCase())));
  protected label(status: string): string { return status === 'SUSPENDED' ? 'Inactive' : status.toLowerCase().replaceAll('_',' ').replace(/^./, value => value.toUpperCase()); }
}
