import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { CreateWorkerRequest, ServiceType, WorkerEngagementType, WorkerRecord } from '@lorne/contracts';

@Component({
  selector: 'lorne-worker-onboarding-form',
  standalone: true,
  imports: [ButtonModule, FormsModule, InputNumberModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="space-y-4" (ngSubmit)="submit()">
      <div>
        <p class="text-xs font-bold uppercase tracking-wide text-teal-700">{{ editing ? 'Worker profile' : 'Worker onboarding' }}</p>
        <h2 class="mt-1 text-xl font-bold text-slate-950">{{ editing ? 'Update worker profile' : 'Create worker profile' }}</h2>
      </div>

      <div class="grid grid-cols-4 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
        @for (tabLabel of tabs; track tabLabel; let index = $index) {
          <button
            pButton
            type="button"
            size="small"
            [severity]="tab === index ? 'primary' : 'secondary'"
            [text]="tab !== index"
            [label]="tabLabel"
            (click)="tab = index"
          ></button>
        }
      </div>

      @if (tab === 0) {
        <div class="grid gap-3">
          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Employee #</span>
              <input pInputText class="w-full" name="employeeNumber" [(ngModel)]="form.employeeNumber" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Hire date</span>
              <input class="w-full border border-slate-300 px-3 py-2" name="hireDate" type="date" [(ngModel)]="form.hireDate" />
            </label>
          </div>

          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Worker name</span>
            <input pInputText class="w-full" name="displayName" required [(ngModel)]="form.displayName" />
          </label>

          <div class="grid grid-cols-2 gap-2">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Phone</span>
              <input pInputText class="w-full" name="phone" [(ngModel)]="form.phone" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Email</span>
              <input pInputText class="w-full" name="email" type="email" [(ngModel)]="form.email" />
            </label>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Worker type</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="engagementType" [(ngModel)]="form.engagementType">
                <option value="FULL_TIME">Full time</option>
                <option value="PART_TIME">Part time</option>
                <option value="CONTRACTOR">Contractor</option>
                <option value="SEASONAL">Seasonal</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Hourly rate</span>
              <p-inputnumber styleClass="w-full" inputStyleClass="w-full" name="hourlyRate" mode="currency" currency="CAD" locale="en-CA" [min]="0" [(ngModel)]="form.hourlyRate" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Max weekly hours</span>
              <p-inputnumber styleClass="w-full" inputStyleClass="w-full" name="maxWeeklyHours" [min]="0" [max]="80" [(ngModel)]="form.maxWeeklyHours" />
            </label>
          </div>
        </div>
      }

      @if (tab === 1) {
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Service skills</p>
          <div class="mt-3 grid gap-2 md:grid-cols-2">
            @for (service of serviceTypes(); track service.id) {
              <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" [checked]="selectedServiceTypeIds.has(service.id)" (change)="toggleService(service.id, $event)" />
                <span class="truncate">{{ service.name }}</span>
              </label>
            } @empty {
              <p class="text-sm font-semibold text-amber-700">Create services before assigning worker skills.</p>
            }
          </div>
        </div>
      }

      @if (tab === 2) {
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Weekly availability</p>
          <div class="mt-3 flex flex-wrap gap-2">
            @for (day of dayOptions; track day.value) {
              <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700">
                <input type="checkbox" [checked]="selectedDays.has(day.value)" (change)="toggleDay(day.value, $event)" />
                {{ day.label }}
              </label>
            }
          </div>
          <div class="mt-3 grid grid-cols-3 gap-2">
            <input class="w-full border border-slate-300 px-3 py-2" name="shiftStart" type="time" [(ngModel)]="shiftStart" />
            <input class="w-full border border-slate-300 px-3 py-2" name="shiftEnd" type="time" [(ngModel)]="shiftEnd" />
            <input pInputText class="w-full" name="timezone" [(ngModel)]="timezone" />
          </div>
        </div>
      }

      @if (tab === 3) {
        <div class="grid gap-3">
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Emergency contact</p>
            <div class="mt-3 grid gap-2">
              <input pInputText class="w-full" name="emergencyName" placeholder="Contact name" [(ngModel)]="form.emergencyContact!.contactName" />
              <div class="grid grid-cols-2 gap-2">
                <input pInputText class="w-full" name="relationship" placeholder="Relationship" [(ngModel)]="form.emergencyContact!.relationship" />
                <input pInputText class="w-full" name="emergencyPhone" placeholder="Phone" [(ngModel)]="form.emergencyContact!.phone" />
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p class="text-xs font-bold uppercase tracking-wide text-slate-500">First certification</p>
            <div class="mt-3 grid gap-2">
              <input pInputText class="w-full" name="certificationName" placeholder="Certification name" [(ngModel)]="certification.certificationName" />
              <input pInputText class="w-full" name="issuedBy" placeholder="Issued by" [(ngModel)]="certification.issuedBy" />
              <div class="grid grid-cols-2 gap-2">
                <input class="w-full border border-slate-300 px-3 py-2" name="issuedOn" type="date" [(ngModel)]="certification.issuedOn" />
                <input class="w-full border border-slate-300 px-3 py-2" name="expiresOn" type="date" [(ngModel)]="certification.expiresOn" />
              </div>
            </div>
          </div>
        </div>
      }

      <div class="flex justify-between gap-2 border-t border-slate-200 pt-3">
        <button pButton type="button" severity="secondary" icon="pi pi-arrow-left" label="Back" [disabled]="tab === 0" (click)="tab = tab - 1"></button>
        @if (tab < tabs.length - 1) {
          <button pButton type="button" icon="pi pi-arrow-right" iconPos="right" label="Next" (click)="tab = tab + 1"></button>
        } @else {
          <button pButton type="submit" [icon]="editing ? 'pi pi-save' : 'pi pi-user-plus'" [loading]="saving()" [label]="editing ? 'Save worker' : 'Onboard worker'"></button>
        }
      </div>
    </form>
  `
})
export class WorkerOnboardingFormComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  readonly serviceTypes = input<ServiceType[]>([]);
  readonly saving = input(false);
  readonly createWorker = output<CreateWorkerRequest>();

  protected readonly tabs = ['Profile', 'Skills', 'Schedule', 'Safety'];
  protected tab = 0;
  protected form: CreateWorkerRequest = this.blankForm();
  protected certification = { certificationName: '', issuedBy: '', issuedOn: '', expiresOn: '' };
  protected readonly dayOptions = [
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' },
    { value: 7, label: 'Sun' }
  ];
  protected readonly selectedDays = new Set([1, 2, 3, 4, 5]);
  protected readonly selectedServiceTypeIds = new Set<string>();
  protected shiftStart = '08:00';
  protected shiftEnd = '17:00';
  protected timezone = 'America/Toronto';
  protected editing = false;

  submit(): void {
    if (!this.form.displayName.trim() || this.saving()) {
      return;
    }
    const emergency = this.form.emergencyContact;
    const certifications = this.certification.certificationName.trim()
      ? [{
          certificationName: this.certification.certificationName.trim(),
          issuedBy: this.certification.issuedBy?.trim() || undefined,
          issuedOn: this.certification.issuedOn || undefined,
          expiresOn: this.certification.expiresOn || undefined
        }]
      : [];
    this.createWorker.emit({
      employeeNumber: this.form.employeeNumber?.trim() || undefined,
      displayName: this.form.displayName.trim(),
      phone: this.form.phone?.trim() || undefined,
      email: this.form.email?.trim() || undefined,
      engagementType: this.form.engagementType,
      maxWeeklyHours: this.form.maxWeeklyHours,
      hourlyRate: this.form.hourlyRate,
      hireDate: this.form.hireDate || undefined,
      emergencyContact: emergency?.contactName?.trim() && emergency.phone?.trim()
        ? { contactName: emergency.contactName.trim(), relationship: emergency.relationship?.trim() || undefined, phone: emergency.phone.trim() }
        : undefined,
      certifications,
      serviceTypeIds: [...this.selectedServiceTypeIds],
      shifts: [...this.selectedDays].sort((a, b) => a - b).map((dayOfWeek) => ({
        dayOfWeek,
        startTime: this.shiftStart,
        endTime: this.shiftEnd,
        timezone: this.timezone || 'America/Toronto'
      }))
    });
  }

  reset(): void {
    this.tab = 0;
    this.editing = false;
    this.form = this.blankForm();
    this.certification = { certificationName: '', issuedBy: '', issuedOn: '', expiresOn: '' };
    this.selectedDays.clear();
    [1, 2, 3, 4, 5].forEach((day) => this.selectedDays.add(day));
    this.selectedServiceTypeIds.clear();
    this.shiftStart = '08:00';
    this.shiftEnd = '17:00';
    this.timezone = 'America/Toronto';
    this.cdr.detectChanges();
  }

  loadWorker(worker: WorkerRecord, tabIndex = 0): void {
    this.tab = Math.max(0, Math.min(tabIndex, this.tabs.length - 1));
    this.editing = true;
    this.form = {
      employeeNumber: worker.employeeNumber || '',
      displayName: worker.displayName,
      phone: worker.phone || '',
      email: worker.email || '',
      engagementType: worker.engagementType,
      maxWeeklyHours: worker.maxWeeklyHours,
      hourlyRate: worker.hourlyRate,
      hireDate: worker.hireDate || '',
      emergencyContact: worker.emergencyContact
        ? { ...worker.emergencyContact }
        : { contactName: '', relationship: '', phone: '' },
      certifications: [],
      serviceTypeIds: [],
      shifts: []
    };
    const certification = worker.certifications[0];
    this.certification = certification
      ? {
          certificationName: certification.certificationName,
          issuedBy: certification.issuedBy || '',
          issuedOn: certification.issuedOn || '',
          expiresOn: certification.expiresOn || ''
        }
      : { certificationName: '', issuedBy: '', issuedOn: '', expiresOn: '' };
    this.selectedServiceTypeIds.clear();
    worker.serviceSkills.forEach((skill) => this.selectedServiceTypeIds.add(skill.serviceTypeId));
    this.selectedDays.clear();
    worker.shifts.forEach((shift) => this.selectedDays.add(shift.dayOfWeek));
    const firstShift = worker.shifts[0];
    this.shiftStart = firstShift?.startTime || '08:00';
    this.shiftEnd = firstShift?.endTime || '17:00';
    this.timezone = firstShift?.timezone || 'America/Toronto';
    this.cdr.detectChanges();
  }

  protected toggleService(serviceTypeId: string, event: Event): void {
    this.toggleSetValue(this.selectedServiceTypeIds, serviceTypeId, event);
  }

  protected toggleDay(day: number, event: Event): void {
    this.toggleSetValue(this.selectedDays, day, event);
  }

  private toggleSetValue<T>(set: Set<T>, value: T, event: Event): void {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    if (checked) {
      set.add(value);
    } else {
      set.delete(value);
    }
  }

  private blankForm(): CreateWorkerRequest {
    return {
      employeeNumber: '',
      displayName: '',
      phone: '',
      email: '',
      engagementType: 'FULL_TIME' as WorkerEngagementType,
      maxWeeklyHours: 40,
      hourlyRate: undefined,
      hireDate: '',
      emergencyContact: { contactName: '', relationship: '', phone: '' },
      certifications: [],
      serviceTypeIds: [],
      shifts: []
    };
  }
}
