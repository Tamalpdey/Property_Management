import { Injectable } from '@angular/core';
import { WorkerJobAction, WorkerJobActionRequest } from '@lorne/contracts';

@Injectable({ providedIn: 'root' })
export class WorkerActionDraftService {
  private readonly prefix = 'lorne.workerActionDraft.';

  read(workOrderId: string, action: WorkerJobAction): WorkerJobActionRequest | null {
    const raw = localStorage.getItem(this.key(workOrderId, action));
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as WorkerJobActionRequest;
    } catch {
      this.clear(workOrderId, action);
      return null;
    }
  }

  write(workOrderId: string, action: WorkerJobAction, value: WorkerJobActionRequest): void {
    if (!this.hasMeaningfulDraft(value)) {
      this.clear(workOrderId, action);
      return;
    }
    localStorage.setItem(this.key(workOrderId, action), JSON.stringify(value));
  }

  clear(workOrderId: string, action: WorkerJobAction): void {
    localStorage.removeItem(this.key(workOrderId, action));
  }

  private key(workOrderId: string, action: WorkerJobAction): string {
    return `${this.prefix}${workOrderId}.${action}`;
  }

  private hasMeaningfulDraft(value: WorkerJobActionRequest): boolean {
    return Boolean(
      value.note?.trim() ||
      value.caption?.trim() ||
      value.materialDescription?.trim() ||
      value.materialId ||
      value.inventoryItemId ||
      value.assetId ||
      value.vendorName?.trim() ||
      value.receiptAmount !== undefined ||
      (value.quantity && value.quantity !== 1)
    );
  }
}
