import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { SuperAdminTenantSummary } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { firstValueFrom } from 'rxjs';
import { SuperAdminTenantService } from './services/super-admin-tenant.service';

@Component({
  selector: 'lorne-tenant-access-button',
  standalone: true,
  imports: [FormsModule, ButtonModule, DialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      pButton
      type="button"
      size="small"
      [severity]="enabled() ? 'danger' : 'success'"
      [outlined]="true"
      icon="pi pi-power-off"
      [label]="enabled() ? 'Deactivate' : 'Activate'"
      [attr.aria-label]="
        (enabled() ? 'Deactivate ' : 'Activate ') + tenant().displayName
      "
      (click)="open()"
    ></button>
    <p-dialog
      [visible]="visible()"
      (visibleChange)="!saving() && visible.set(false)"
      [modal]="true"
      [header]="enabled() ? 'Deactivate tenant' : 'Activate tenant'"
      [style]="{ width: '480px', maxWidth: 'calc(100vw - 24px)' }"
      [closable]="!saving()"
      [draggable]="false"
    >
      <form (ngSubmit)="save()" class="access-change">
        <strong>{{ tenant().displayName }}</strong>
        <p>
          {{
            enabled()
              ? 'Tenant and worker access will be blocked. Existing data will be retained.'
              : 'Tenant and worker access will be restored and the account status will be Active.'
          }}
        </p>
        <label for="{{ 'access-reason-' + tenant().id }}">Reason</label>
        <textarea
          [id]="'access-reason-' + tenant().id"
          name="reason"
          rows="3"
          minlength="10"
          maxlength="1000"
          required
          [(ngModel)]="reason"
          [disabled]="saving()"
        ></textarea>
        @if (error()) {
          <p role="alert" class="failure">{{ error() }}</p>
        }
        <div class="buttons">
          <button
            pButton
            type="button"
            severity="secondary"
            label="Cancel"
            [disabled]="saving()"
            (click)="visible.set(false)"
          ></button
          ><button
            pButton
            type="submit"
            [severity]="enabled() ? 'danger' : 'success'"
            [label]="enabled() ? 'Confirm deactivation' : 'Confirm activation'"
            [loading]="saving()"
            [disabled]="saving() || reason.trim().length < 10"
          ></button>
        </div>
      </form>
    </p-dialog>
  `,
  styles: `
    .access-change {
      display: grid;
      gap: 12px;
      font-size: 14px;
    }
    .access-change p {
      margin: 0;
      line-height: 1.5;
      color: #64748b;
    }
    .access-change textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px;
      font: inherit;
      resize: vertical;
    }
    .buttons {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
    }
    .access-change .failure {
      color: #b91c1c;
    }
  `
})
export class TenantAccessButtonComponent {
  readonly tenant =
    input.required<
      Pick<SuperAdminTenantSummary, 'id' | 'displayName' | 'status'>
    >();
  readonly changed = output<SuperAdminTenantSummary>();
  protected readonly enabled = computed(() =>
    ['ACTIVE', 'TRIAL', 'PAST_DUE'].includes(this.tenant().status)
  );
  protected readonly visible = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected reason = '';
  private readonly service = inject(SuperAdminTenantService);
  protected open(): void {
    this.reason = '';
    this.error.set('');
    this.visible.set(true);
  }
  protected async save(): Promise<void> {
    if (this.saving() || this.reason.trim().length < 10) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const updated = await firstValueFrom(
        this.service.setAccess(
          this.tenant().id,
          !this.enabled(),
          this.reason.trim()
        )
      );
      this.visible.set(false);
      this.changed.emit(updated);
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse
          ? error.error?.error?.message || 'Unable to change tenant access.'
          : 'Unable to change tenant access.'
      );
    } finally {
      this.saving.set(false);
    }
  }
}
