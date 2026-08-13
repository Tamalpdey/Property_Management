import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class TenantAccessService {
  private readonly auth = inject(AuthService);

  readonly canManageTenantSettings = computed(() => this.auth.hasRole('TENANT_ADMIN'));
  readonly canManageTenantUsers = computed(() => this.auth.hasRole('TENANT_ADMIN'));
  readonly canManageWorkerAppLogins = computed(() => this.auth.hasRole('TENANT_ADMIN'));
  readonly canManageWorkers = computed(() => this.auth.hasAnyRole(['TENANT_ADMIN', 'OPERATIONS']));
  readonly canManageWorkOrders = computed(() => this.auth.hasAnyRole(['TENANT_ADMIN', 'OPERATIONS']));
  readonly canManageInventory = computed(() => this.auth.hasAnyRole(['TENANT_ADMIN', 'OPERATIONS']));
  readonly canManageBilling = computed(() => this.auth.hasAnyRole(['TENANT_ADMIN', 'FINANCE']));

  readonly billingDeniedMessage = 'Billing actions are available to tenant admins and finance users.';
  readonly workerLoginDeniedMessage = 'Worker app login management is available to tenant admins.';
}
