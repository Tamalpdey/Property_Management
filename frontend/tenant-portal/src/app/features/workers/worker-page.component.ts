import { ChangeDetectionStrategy, Component, ViewChild, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { CreateTenantUserRequest, CreateWorkerRequest, ServiceType, TenantRoleOption, WorkerRecord } from '@lorne/contracts';
import { ServiceCatalogService } from '../services/services/service-catalog.service';
import { TenantUserDialogComponent } from '../users/components/tenant-user-dialog.component';
import { TenantUserService } from '../users/services/tenant-user.service';
import { WorkerListComponent } from './components/worker-list.component';
import { WorkerOnboardingFormComponent } from './components/worker-onboarding-form.component';
import { WorkerManagementService } from './services/worker-management.service';

@Component({
  selector: 'lorne-worker-page',
  standalone: true,
  imports: [ButtonModule, DialogModule, TagModule, TenantUserDialogComponent, WorkerListComponent, WorkerOnboardingFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Workers" severity="success" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Workers</h1>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ workers().length }} records</span>
          </div>
          <button pButton type="button" icon="pi pi-plus" label="Add worker" (click)="showCreate.set(true)"></button>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <lorne-worker-list [workers]="workers()" (createAppLogin)="openAppLogin($event)" />

      <p-dialog header="Add worker" [modal]="true" [visible]="showCreate()" [style]="{ width: 'min(56rem, 94vw)' }" (visibleChange)="showCreate.set($event)">
        <lorne-worker-onboarding-form [serviceTypes]="serviceTypes()" [saving]="saving()" (createWorker)="create($event)" />
      </p-dialog>

      <lorne-tenant-user-dialog
        title="Create worker app login"
        submitLabel="Save app login"
        [visible]="showAppLogin()"
        [roles]="roles()"
        [workers]="workers()"
        [linkedWorker]="selectedLoginWorker()"
        [saving]="loginSaving()"
        (visibleChange)="showAppLogin.set($event)"
        (createUser)="createAppLogin($event)"
      />
    </section>
  `
})
export class WorkerPageComponent {
  private readonly workerManagementService = inject(WorkerManagementService);
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  private readonly tenantUserService = inject(TenantUserService);
  @ViewChild(WorkerOnboardingFormComponent) private onboardingForm?: WorkerOnboardingFormComponent;
  protected readonly workers = signal<WorkerRecord[]>([]);
  protected readonly serviceTypes = signal<ServiceType[]>([]);
  protected readonly roles = signal<TenantRoleOption[]>([]);
  protected readonly saving = signal(false);
  protected readonly loginSaving = signal(false);
  protected readonly error = signal('');
  protected readonly showCreate = signal(false);
  protected readonly showAppLogin = signal(false);
  protected readonly selectedLoginWorker = signal<WorkerRecord | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const [workers, catalog, roles] = await Promise.all([
      firstValueFrom(this.workerManagementService.list()),
      firstValueFrom(this.serviceCatalogService.catalog()),
      firstValueFrom(this.tenantUserService.roles())
    ]);
    this.workers.set(workers);
    this.serviceTypes.set(catalog.serviceTypes);
    this.roles.set(roles);
  }

  async create(request: CreateWorkerRequest): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const worker = await firstValueFrom(this.workerManagementService.create(request));
      this.workers.update((workers) => [worker, ...workers].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      this.onboardingForm?.reset();
      this.showCreate.set(false);
    } catch {
      this.error.set('Unable to onboard worker. Check duplicate employee number, required fields, or backend status.');
    } finally {
      this.saving.set(false);
    }
  }

  protected openAppLogin(worker: WorkerRecord): void {
    this.selectedLoginWorker.set(worker);
    this.showAppLogin.set(true);
  }

  protected async createAppLogin(request: CreateTenantUserRequest): Promise<void> {
    if (this.loginSaving()) {
      return;
    }
    this.loginSaving.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.tenantUserService.create(request));
      await this.refreshWorkers();
      this.showAppLogin.set(false);
      this.selectedLoginWorker.set(null);
    } catch {
      this.error.set('Unable to create worker app login. Check email, temporary password, or existing user link.');
    } finally {
      this.loginSaving.set(false);
    }
  }

  private async refreshWorkers(): Promise<void> {
    this.workers.set(await firstValueFrom(this.workerManagementService.list()));
  }
}
