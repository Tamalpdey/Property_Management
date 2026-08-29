import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'lorne-worker-guide',
  standalone: true,
  imports: [ButtonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-5xl space-y-3">
      <div class="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-white shadow-xl shadow-teal-950/15">
        <div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div>
            <span class="rounded-md bg-teal-300 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-950">Worker guide</span>
            <h1 class="mt-3 text-2xl font-black leading-tight sm:text-4xl">How to use the field app</h1>
            <p class="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
              Use this guide during onboarding or anytime you need a quick reminder before starting work in the field.
            </p>
          </div>
          <a
            pButton
            routerLink="/today"
            severity="secondary"
            icon="pi pi-briefcase"
            label="Open jobs"
            class="w-full justify-center sm:w-auto"
          ></a>
        </div>
      </div>

      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div class="space-y-3">
          <section class="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
            <div class="flex items-start gap-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                <i class="pi pi-clock"></i>
              </span>
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Start Of Day</p>
                <h2 class="mt-1 text-xl font-black text-slate-950">Clock in before doing field work</h2>
                <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Tap <strong>Clock in</strong> when your shift starts. Field actions are blocked until the shift clock is active. If you take a break, use shift pause/resume when available.
                </p>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
            <div class="flex items-start gap-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                <i class="pi pi-list"></i>
              </span>
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Jobs</p>
                <h2 class="mt-1 text-xl font-black text-slate-950">Find today's work orders</h2>
                <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Use the calendar strip to move between past, current, and future assigned jobs. Tap a work-order card to open the full job workflow.
                </p>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
            <div class="flex items-start gap-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                <i class="pi pi-map"></i>
              </span>
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Execution Flow</p>
                <h2 class="mt-1 text-xl font-black text-slate-950">Move through the job in order</h2>
                <div class="mt-3 grid gap-2 sm:grid-cols-3">
                  <span class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">Ready</span>
                  <span class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">Travel</span>
                  <span class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">On site</span>
                  <span class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">Work</span>
                  <span class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">Photos</span>
                  <span class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">Done</span>
                </div>
                <p class="mt-3 text-sm font-semibold leading-6 text-slate-600">
                  These taps create the work-order timeline. If you need to leave mid-job, use the emergency flow so operations can see the handoff.
                </p>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
            <div class="flex items-start gap-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                <i class="pi pi-camera"></i>
              </span>
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Evidence</p>
                <h2 class="mt-1 text-xl font-black text-slate-950">Upload photos and receipts</h2>
                <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Add before photos, after photos, issue photos, and purchase receipts from camera or file upload. Captions help operations understand what was captured.
                </p>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
            <div class="flex items-start gap-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                <i class="pi pi-box"></i>
              </span>
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Materials And Tools</p>
                <h2 class="mt-1 text-xl font-black text-slate-950">Record what you used or returned</h2>
                <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Mark planned materials as used, add new purchases when needed, and review the Loadout tab for tools or equipment that must be checked back in.
                </p>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
            <div class="flex items-start gap-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                <i class="pi pi-stopwatch"></i>
              </span>
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Activity</p>
                <h2 class="mt-1 text-xl font-black text-slate-950">Track non-billable work</h2>
                <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Use Activity for non-billable work or non-property time such as office visits, supplier pickup, shop time, or general travel. Start and end each activity so it appears correctly on the Day Ticket.
                </p>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
            <div class="flex items-start gap-3">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
                <i class="pi pi-ticket"></i>
              </span>
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Day Ticket</p>
                <h2 class="mt-1 text-xl font-black text-slate-950">Review your daily ticket</h2>
                <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  The Ticket tab shows the same day-ticket format operations can print. It includes clock sessions, work orders, travel/activity rows, notes, and totals when captured.
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside class="space-y-3">
          <section class="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p class="text-xs font-black uppercase tracking-wide text-amber-800">Important</p>
            <p class="mt-2 text-sm font-bold leading-6 text-amber-900">
              If a job is locked after submission, you can still add allowed evidence such as photos or receipts when operations permits it.
            </p>
          </section>
          <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Your Profile</p>
            <div class="mt-3 flex items-center gap-3">
              <span class="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-teal-50 text-lg font-black text-teal-800">
                @if (userPhotoUrl()) {
                  <img class="h-full w-full object-cover" [src]="userPhotoUrl()" [alt]="userDisplayName() + ' photo'" />
                } @else {
                  {{ userInitials() }}
                }
              </span>
              <div class="min-w-0">
                <p class="truncate text-base font-black text-slate-950">{{ userDisplayName() }}</p>
                <p class="truncate text-xs font-semibold text-slate-500">{{ userEmail() }}</p>
              </div>
            </div>
            <input
              #profilePhotoInput
              class="hidden"
              type="file"
              accept="image/*"
              (change)="selectProfilePhoto($event)"
            />
            <button
              pButton
              type="button"
              severity="secondary"
              icon="pi pi-upload"
              label="Upload photo"
              class="mt-3 w-full justify-center"
              [loading]="uploadingProfilePhoto()"
              (click)="profilePhotoInput.click()"
            ></button>
            @if (profilePhotoMessage()) {
              <p class="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">{{ profilePhotoMessage() }}</p>
            }
            @if (profilePhotoError()) {
              <p class="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{{ profilePhotoError() }}</p>
            }
          </section>
          <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-slate-500">Quick Links</p>
            <div class="mt-3 grid gap-2">
              <a pButton routerLink="/today" severity="secondary" icon="pi pi-calendar" label="Jobs"></a>
              <a pButton routerLink="/activity" severity="secondary" icon="pi pi-stopwatch" label="Activity"></a>
              <a pButton routerLink="/loadout" severity="secondary" icon="pi pi-briefcase" label="Loadout"></a>
              <a pButton routerLink="/day-ticket" severity="secondary" icon="pi pi-print" label="Ticket"></a>
            </div>
          </section>
          <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-slate-500">Need Help?</p>
            <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Contact operations if a job is missing, a route stop is wrong, a tool is unavailable, or you cannot complete a required check.
            </p>
          </section>
        </aside>
      </div>
    </section>
  `
})
export class WorkerGuideComponent {
  private readonly auth = inject(AuthService);
  protected readonly uploadingProfilePhoto = signal(false);
  protected readonly profilePhotoMessage = signal('');
  protected readonly profilePhotoError = signal('');
  protected readonly userPhotoUrl = computed(() => this.auth.currentUser()?.profilePhotoUrl || '');
  protected readonly userDisplayName = computed(() => this.auth.currentUser()?.displayName || 'Worker');
  protected readonly userEmail = computed(() => this.auth.currentUser()?.email || '');
  protected readonly userInitials = computed(() => this.initials(this.userDisplayName()));

  protected async selectProfilePhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.uploadingProfilePhoto()) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.profilePhotoError.set('Choose an image file for your profile photo.');
      return;
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      this.profilePhotoError.set('Profile photo must be between 1 byte and 10 MB.');
      return;
    }

    this.uploadingProfilePhoto.set(true);
    this.profilePhotoMessage.set('');
    this.profilePhotoError.set('');
    try {
      const upload = await firstValueFrom(this.auth.profilePhotoUploadUrl({
        fileName: file.name,
        contentType: file.type,
        byteSize: file.size
      }));
      await firstValueFrom(this.auth.uploadProfilePhoto(upload, file));
      await this.auth.updateProfilePhoto(this.auth.profilePhotoUrl(upload.documentId));
      this.profilePhotoMessage.set('Profile photo updated.');
    } catch (error) {
      this.profilePhotoError.set(errorMessage(error, 'Unable to update profile photo. Try again from your gallery or files.'));
    } finally {
      this.uploadingProfilePhoto.set(false);
    }
  }

  private initials(value: string): string {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'W';
  }
}

function errorMessage(exception: unknown, fallback: string): string {
  if (exception instanceof HttpErrorResponse) {
    const body = exception.error;
    return typeof body?.error?.message === 'string' ? body.error.message : fallback;
  }
  return fallback;
}
