import type { WorkOrderStatus } from '@lorne/contracts';

export interface WorkOrderStatusOption {
  value: WorkOrderStatus;
  label: string;
}

export interface WorkOrderStatusGroup {
  label: string;
  options: WorkOrderStatusOption[];
}

export const WORK_ORDER_STATUS_GROUPS: WorkOrderStatusGroup[] = [
  {
    label: 'Planning',
    options: [
      { value: 'DRAFT', label: 'Draft' },
      { value: 'CREATED', label: 'Created' },
      { value: 'TO_DO', label: 'To do' },
      { value: 'PENDING', label: 'Pending' },
      { value: 'SCHEDULED', label: 'Scheduled' }
    ]
  },
  {
    label: 'Dispatch',
    options: [
      { value: 'ASSIGNED', label: 'Assigned' },
      { value: 'TRAVELING', label: 'Traveling' },
      { value: 'ON_SITE', label: 'On site' },
      { value: 'IN_PROGRESS', label: 'In progress' },
      { value: 'PAUSED', label: 'Paused' }
    ]
  },
  {
    label: 'Review and billing',
    options: [
      { value: 'PENDING_COMPLETION', label: 'Pending review' },
      { value: 'COMPLETED', label: 'Completed' },
      { value: 'APPROVED', label: 'Approved' },
      { value: 'CUSTOMER_NOTIFIED', label: 'Customer notified' },
      { value: 'INVOICED', label: 'Invoiced' },
      { value: 'PAID', label: 'Paid' }
    ]
  },
  {
    label: 'Exception',
    options: [
      { value: 'ON_HOLD', label: 'On hold' },
      { value: 'CANCELLED', label: 'Cancelled' }
    ]
  }
];

export const WORK_ORDER_BULK_STATUS_GROUPS: WorkOrderStatusGroup[] = [
  {
    label: 'Planning',
    options: [
      { value: 'TO_DO', label: 'To do' },
      { value: 'SCHEDULED', label: 'Scheduled' }
    ]
  },
  {
    label: 'Dispatch',
    options: [
      { value: 'ASSIGNED', label: 'Assigned' }
    ]
  },
  {
    label: 'Exception',
    options: [
      { value: 'ON_HOLD', label: 'On hold' }
    ]
  }
];

export function workOrderStatusLabel(status: string): string {
  for (const group of WORK_ORDER_STATUS_GROUPS) {
    const option = group.options.find((candidate) => candidate.value === status);
    if (option) {
      return option.label;
    }
  }
  return status.toLowerCase().replaceAll('_', ' ');
}
