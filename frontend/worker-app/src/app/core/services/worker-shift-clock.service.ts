import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiResponse, WorkerShiftClockRequest, WorkerShiftClockState } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WorkerShiftClockService {
  private readonly http = inject(HttpClient);
  private readonly stateSignal = signal<WorkerShiftClockState>({ clockedIn: false });
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal('');

  readonly state = this.stateSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly clockedIn = computed(() => this.stateSignal().clockedIn);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    if (this.loadingSignal()) {
      return;
    }
    this.loadingSignal.set(true);
    this.errorSignal.set('');
    try {
      const response = await firstValueFrom(this.http.get<ApiResponse<WorkerShiftClockState>>(`${environment.apiBaseUrl}/field-worker/clock`));
      this.stateSignal.set(response.data);
    } catch {
      this.errorSignal.set('Unable to load shift clock.');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async clockIn(): Promise<void> {
    await this.clock('/field-worker/clock/in', 'Unable to clock in.');
  }

  async clockOut(): Promise<void> {
    await this.clock('/field-worker/clock/out', 'Unable to clock out.');
  }

  private async clock(path: string, fallback: string): Promise<void> {
    if (this.loadingSignal()) {
      return;
    }
    this.loadingSignal.set(true);
    this.errorSignal.set('');
    try {
      const response = await firstValueFrom(this.http.post<ApiResponse<WorkerShiftClockState>>(`${environment.apiBaseUrl}${path}`, await clockMetadata()));
      this.stateSignal.set(response.data);
    } catch {
      this.errorSignal.set(fallback);
    } finally {
      this.loadingSignal.set(false);
    }
  }
}

async function clockMetadata(): Promise<WorkerShiftClockRequest> {
  const metadata: WorkerShiftClockRequest = {
    deviceTimestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: userAgentPlatform()
  };
  const position = await currentPosition();
  if (!position) {
    return metadata;
  }
  return {
    ...metadata,
    latitude: Number(position.coords.latitude.toFixed(7)),
    longitude: Number(position.coords.longitude.toFixed(7)),
    locationAccuracyMeters: Math.round(position.coords.accuracy)
  };
}

function userAgentPlatform(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || navigator.platform || 'unknown';
}

function currentPosition(): Promise<GeolocationPosition | null> {
  if (!navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (position: GeolocationPosition | null) => {
      if (!settled) {
        settled = true;
        resolve(position);
      }
    };
    const timeout = window.setTimeout(() => done(null), 1500);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timeout);
        done(position);
      },
      () => {
        window.clearTimeout(timeout);
        done(null);
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 1200 }
    );
  });
}
