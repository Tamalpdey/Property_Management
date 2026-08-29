import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CreateTenantUserRequest, TenantAssignableRole, TenantRoleOption, TenantUserRecord, UpdateTenantUserRequest, WorkerRecord } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'lorne-tenant-user-dialog',
  standalone: true,
  imports: [ButtonModule, DialogModule, FormsModule, InputTextModule, PasswordModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="title"
      [modal]="true"
      [visible]="visible"
      [style]="{ width: '44rem', maxWidth: '94vw', height: '38rem', maxHeight: '90vh' }"
      [contentStyle]="{ height: 'calc(100% - 4rem)', overflow: 'auto' }"
      (visibleChange)="visibleChange.emit($event)"
    >
      <form class="grid gap-4" (ngSubmit)="submit()">
        @if (linkedWorker) {
          <div class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
            <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Linked worker profile</p>
            <p class="mt-1 text-sm font-bold text-slate-950">{{ linkedWorker.displayName }}</p>
            <p class="text-xs font-semibold text-slate-600">{{ linkedWorker.employeeNumber || 'No employee number' }}</p>
          </div>
        }

        <div class="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white text-lg font-black text-teal-700">
            @if (form.profilePhotoUrl) {
              <img class="h-full w-full object-cover" [src]="form.profilePhotoUrl" alt="User profile photo" />
            } @else {
              {{ avatarInitials }}
            }
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-bold text-slate-950">User photo</p>
            <p class="text-xs font-semibold text-slate-500">Shown in app headers, worker lists, and user profile views.</p>
          </div>
          <input #profilePhotoInput class="hidden" type="file" accept="image/*" (change)="selectProfilePhoto($event)" />
          <button
            pButton
            type="button"
            severity="secondary"
            icon="pi pi-upload"
            [loading]="uploadingPhoto()"
            label="Upload"
            (click)="profilePhotoInput.click()"
          ></button>
          @if (form.profilePhotoUrl) {
            <button pButton type="button" severity="secondary" icon="pi pi-times" label="Remove" (click)="clearProfilePhoto()"></button>
          }
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Display name</span>
            <input pInputText class="w-full" name="displayName" required [(ngModel)]="form.displayName" />
          </label>
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Email</span>
            <input pInputText class="w-full" name="email" type="email" required [disabled]="!!editingUser" [(ngModel)]="form.email" />
          </label>
        </div>

        <div class="grid gap-3 md:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Phone</span>
            <input pInputText class="w-full" name="phone" [(ngModel)]="form.phone" />
          </label>
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">{{ editingUser ? 'New password' : 'Temporary password' }}</span>
            <p-password styleClass="w-full" inputStyleClass="w-full" name="temporaryPassword" [feedback]="false" [(ngModel)]="form.temporaryPassword" />
            @if (editingUser) {
              <span class="mt-1 block text-xs font-semibold text-slate-500">Leave blank to keep the existing password.</span>
            }
          </label>
        </div>

        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Tenant roles</p>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            @for (role of roles; track role.code) {
              <label class="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2" [class.opacity-70]="fieldWorkerLocked && role.code === 'FIELD_WORKER'">
                <input
                  class="mt-1 h-4 w-4"
                  type="checkbox"
                  [checked]="selectedRoles.has(role.code)"
                  [disabled]="fieldWorkerLocked && role.code === 'FIELD_WORKER'"
                  (change)="toggleRole(role.code, $event)"
                />
                <span>
                  <span class="block text-sm font-bold text-slate-950">{{ role.displayName }}</span>
                  <span class="block text-xs font-semibold text-slate-500">{{ roleDescription(role.code) }}</span>
                </span>
              </label>
            }
          </div>
        </div>

        @if (selectedRoles.has('FIELD_WORKER') && !linkedWorker) {
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Linked worker profile</span>
            <select class="w-full border border-slate-300 px-3 py-2" name="workerId" [(ngModel)]="form.workerId">
              <option value="">Create linked worker profile</option>
              @for (worker of workers; track worker.id) {
                <option [value]="worker.id">{{ worker.displayName }} {{ worker.employeeNumber ? '(' + worker.employeeNumber + ')' : '' }}</option>
              }
            </select>
            <span class="mt-1 block text-xs font-semibold text-slate-500">Leave this as create linked profile when the worker does not exist yet.</span>
          </label>
        }

        @if (formError) {
          <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ formError }}</p>
        }

        <div class="flex justify-end gap-2">
          <button pButton type="button" severity="secondary" label="Cancel" (click)="visibleChange.emit(false)"></button>
          <button pButton type="submit" icon="pi pi-user-plus" [loading]="saving" [label]="submitLabel"></button>
        </div>
      </form>
    </p-dialog>
  `
})
export class TenantUserDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() title = 'Add tenant user';
  @Input() submitLabel = 'Create user';
  @Input() saving = false;
  @Input() roles: TenantRoleOption[] = [];
  @Input() workers: WorkerRecord[] = [];
  @Input() linkedWorker: WorkerRecord | null = null;
  @Input() editingUser: TenantUserRecord | null = null;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() saveUser = new EventEmitter<CreateTenantUserRequest | UpdateTenantUserRequest>();

  protected form: CreateTenantUserRequest = this.blankForm();
  protected formError = '';
  protected readonly selectedRoles = new Set<TenantAssignableRole>(['OPERATIONS']);

  get fieldWorkerLocked(): boolean {
    return !!this.linkedWorker;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['visible'] && this.visible) || (changes['linkedWorker'] && this.visible) || (changes['editingUser'] && this.visible)) {
      this.reset();
    }
  }

  protected submit(): void {
    this.formError = '';
    if (!this.form.displayName.trim() || !this.form.email.trim()) {
      this.formError = 'Name and email are required.';
      return;
    }
    if (!this.editingUser && (!this.form.temporaryPassword.trim() || this.form.temporaryPassword.trim().length < 8)) {
      this.formError = 'Temporary password must be at least 8 characters.';
      return;
    }
    if (this.editingUser && this.form.temporaryPassword.trim() && this.form.temporaryPassword.trim().length < 8) {
      this.formError = 'New password must be at least 8 characters.';
      return;
    }
    if (!this.selectedRoles.size) {
      this.formError = 'Select at least one role.';
      return;
    }
    this.saveUser.emit({
      displayName: this.form.displayName.trim(),
      email: this.form.email.trim(),
      phone: this.form.phone?.trim() || undefined,
      temporaryPassword: this.form.temporaryPassword.trim() || undefined,
      roles: [...this.selectedRoles],
      profilePhotoUrl: this.form.profilePhotoUrl || undefined,
      workerId: this.selectedRoles.has('FIELD_WORKER') && this.form.workerId ? this.form.workerId : undefined
    } as CreateTenantUserRequest | UpdateTenantUserRequest);
  }

  protected async selectProfilePhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.uploadingPhoto()) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.formError = 'Choose an image file for the user photo.';
      return;
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      this.formError = 'User photo must be between 1 byte and 10 MB.';
      return;
    }

    this.uploadingPhoto.set(true);
    this.formError = '';
    try {
      const upload = await firstValueFrom(this.auth.profilePhotoUploadUrl({
        fileName: file.name,
        contentType: file.type,
        byteSize: file.size
      }));
      await firstValueFrom(this.auth.uploadProfilePhoto(upload, file));
      this.form.profilePhotoUrl = this.auth.profilePhotoUrl(upload.documentId);
    } catch {
      this.formError = 'Unable to upload user photo. Check the image file and try again.';
    } finally {
      this.uploadingPhoto.set(false);
    }
  }

  protected clearProfilePhoto(): void {
    this.form.profilePhotoUrl = undefined;
  }

  protected toggleRole(role: TenantAssignableRole, event: Event): void {
    if (this.fieldWorkerLocked && role === 'FIELD_WORKER') {
      return;
    }
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    if (checked) {
      this.selectedRoles.add(role);
    } else {
      this.selectedRoles.delete(role);
      if (role === 'FIELD_WORKER') {
        this.form.workerId = undefined;
      }
    }
  }

  protected get avatarInitials(): string {
    const source = this.form.displayName || this.form.email || 'U';
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'U';
  }

  protected roleDescription(role: TenantAssignableRole): string {
    switch (role) {
      case 'TENANT_ADMIN':
        return 'Full tenant administration and setup.';
      case 'OPERATIONS':
        return 'Owners, properties, work orders, dispatch.';
      case 'FINANCE':
        return 'Invoices, payments, payroll visibility.';
      case 'FIELD_WORKER':
        return 'Mobile worker app and assigned jobs.';
      case 'CUSTOMER':
        return 'Future owner/customer portal access.';
    }
  }

  private readonly auth = inject(AuthService);
  protected readonly uploadingPhoto = signal(false);

  private reset(): void {
    this.form = this.blankForm();
    this.selectedRoles.clear();
    if (this.editingUser) {
      this.editingUser.roles.forEach((role) => this.selectedRoles.add(role));
      this.form = {
        displayName: this.editingUser.displayName,
        profilePhotoUrl: this.editingUser.profilePhotoUrl || undefined,
        email: this.editingUser.email,
        phone: this.editingUser.phone || '',
        temporaryPassword: '',
        roles: this.editingUser.roles,
        workerId: this.editingUser.workerId || undefined
      };
    } else if (this.linkedWorker) {
      this.selectedRoles.add('FIELD_WORKER');
      this.form = {
        ...this.form,
        workerId: this.linkedWorker.id,
        roles: ['FIELD_WORKER']
      };
    } else {
      this.selectedRoles.add('OPERATIONS');
    }
    this.formError = '';
  }

  private blankForm(): CreateTenantUserRequest {
    return {
      displayName: '',
      profilePhotoUrl: undefined,
      email: '',
      phone: '',
      temporaryPassword: '',
      roles: ['OPERATIONS'],
      workerId: undefined
    };
  }
}
