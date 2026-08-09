export type LorneRole =
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'OPERATIONS'
  | 'FINANCE'
  | 'FIELD_WORKER'
  | 'CUSTOMER';

export type WorkOrderStatus =
  | 'DRAFT'
  | 'TO_DO'
  | 'PENDING'
  | 'CREATED'
  | 'SCHEDULED'
  | 'ASSIGNED'
  | 'TRAVELING'
  | 'ON_SITE'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'APPROVED'
  | 'CUSTOMER_NOTIFIED'
  | 'INVOICED'
  | 'PAID'
  | 'ON_HOLD'
  | 'PENDING_COMPLETION'
  | 'CANCELLED';

export type WorkOrderSource = 'ADHOC_CALL' | 'RECURRING' | 'WEBSITE' | 'TENANT_PORTAL' | 'CUSTOMER_PORTAL';

export interface CurrentUser {
  id: string;
  tenantId?: string;
  displayName: string;
  email: string;
  roles: LorneRole[];
  permissions: string[];
}

export type TenantAssignableRole = 'TENANT_ADMIN' | 'OPERATIONS' | 'FINANCE' | 'FIELD_WORKER' | 'CUSTOMER';

export interface TenantUserRecord {
  id: string;
  displayName: string;
  email: string;
  phone?: string;
  status: 'INVITED' | 'ACTIVE' | 'DISABLED' | 'LOCKED' | string;
  roles: TenantAssignableRole[];
  workerId?: string;
  workerName?: string;
  lastLoginAt?: string;
  createdAt: string;
}

export interface TenantRoleOption {
  code: TenantAssignableRole;
  displayName: string;
}

export interface CreateTenantUserRequest {
  displayName: string;
  email: string;
  phone?: string;
  temporaryPassword: string;
  roles: TenantAssignableRole[];
  workerId?: string;
}

export interface UpdateTenantUserRequest extends Omit<CreateTenantUserRequest, 'temporaryPassword'> {
  temporaryPassword?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    fields?: Array<{
      field: string;
      message: string;
    }>;
  };
  timestamp: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  tenantId?: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  user: CurrentUser;
}

export interface WorkerTodayResponse {
  nextJob: {
    title: string;
    propertyName: string;
    address: string;
    window: string;
    notes: string;
    checklist: string[];
  };
  steps: Array<{
    key: WorkerStepKey;
    label: string;
    icon: string;
  }>;
  quickActions: Array<{
    label: string;
    icon: string;
    severity: 'secondary' | 'success' | 'info' | 'warn' | 'danger';
  }>;
}

export type WorkerStepKey = 'ready' | 'travel' | 'onsite' | 'work' | 'photos' | 'complete';

export type WorkerJobAction =
  | 'START_TRAVEL'
  | 'ARRIVE_ON_SITE'
  | 'START_WORK'
  | 'PAUSE_WORK'
  | 'RESUME_WORK'
  | 'COMPLETE_WORK'
  | 'COMPLETE_CHECKLIST'
  | 'ADD_NOTE'
  | 'ADD_MATERIAL_USED'
  | 'RETURN_TOOL'
  | 'ADD_PHOTO'
  | 'ADD_PURCHASE_RECEIPT'
  | 'UPDATE_NOTE'
  | 'LEAVE_EMERGENCY'
  | 'VIEW_DISPATCH'
  | 'VIEW_PRE_START_CHECKLIST'
  | 'VIEW_COMPLETION_CHECKLIST'
  | 'VIEW_TIMELINE';

export interface WorkerShiftClockState {
  clockedIn: boolean;
  entryId?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface WorkerShiftClockRequest {
  latitude?: number;
  longitude?: number;
  locationAccuracyMeters?: number;
  deviceTimestamp?: string;
  userAgent?: string;
  platform?: string;
}

export interface WorkerAssignedJob {
  id: string;
  workOrderNumber: string;
  title: string;
  propertyName: string;
  ownerName: string;
  address: string;
  serviceName?: string;
  status: WorkOrderStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  scheduledStart?: string;
  scheduledEnd?: string;
  notes?: string;
  leadWorker: boolean;
  assignmentStatus: string;
  checklist: WorkerJobChecklistItem[];
  materials: WorkerJobMaterial[];
  assets: WorkerJobAsset[];
  fieldNotes: WorkerFieldNote[];
  evidence: WorkerJobEvidence[];
  executionEvents: WorkerExecutionEvent[];
}

export interface WorkerJobChecklistItem {
  id: string;
  label: string;
  phase: 'PRE_START' | 'COMPLETION';
  required: boolean;
  completed: boolean;
  taskStatus: string;
}

export interface WorkerJobMaterial {
  id: string;
  inventoryItemId?: string;
  itemName?: string;
  description?: string;
  quantity: number;
  unit?: string;
  used: boolean;
  usedAt?: string;
}

export interface WorkerJobAsset {
  assetId: string;
  assetType: string;
  name: string;
  identifier?: string;
}

export interface WorkerJobActionRequest {
  action: WorkerJobAction;
  note?: string;
  noteId?: string;
  taskId?: string;
  materialId?: string;
  inventoryItemId?: string;
  materialDescription?: string;
  quantity?: number;
  unitCost?: number;
  assetId?: string;
  documentId?: string;
  photoType?: 'BEFORE' | 'AFTER' | 'ISSUE' | 'OTHER';
  caption?: string;
  receiptAmount?: number;
  vendorName?: string;
  latitude?: number;
  longitude?: number;
  locationAccuracyMeters?: number;
  deviceTimestamp?: string;
  userAgent?: string;
  platform?: string;
}

export interface WorkerFieldNote {
  id: string;
  note: string;
  workerName: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
}

export interface WorkerJobEvidence {
  documentId: string;
  documentType: 'WORK_PHOTO' | 'PURCHASE_RECEIPT';
  photoType?: 'BEFORE' | 'AFTER' | 'ISSUE' | 'OTHER';
  caption?: string;
  viewUrl?: string;
  contentType?: string;
  byteSize?: number;
  createdByName?: string;
  createdAt: string;
  canDelete: boolean;
}

export interface WorkerExecutionEvent {
  action: string;
  label: string;
  workerName?: string;
  occurredAt: string;
  note?: string;
}

export interface PhotoUploadRequest {
  fileName: string;
  contentType: string;
  byteSize: number;
  photoType?: 'BEFORE' | 'AFTER' | 'ISSUE' | 'OTHER';
  documentType?: 'WORK_PHOTO' | 'PURCHASE_RECEIPT';
}

export interface PresignedPhotoUpload {
  documentId: string;
  bucket: string;
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
  headers: Record<string, string>;
}

export interface WorkerJobActionResponse {
  job: WorkerAssignedJob;
  message: string;
}

export interface SuperAdminOverviewResponse {
  metrics: Array<{
    label: string;
    value: string;
    severity: 'success' | 'info' | 'warn' | 'danger' | 'contrast';
    icon: string;
  }>;
  tenantHealth: Array<{
    tenantName: string;
    status: string;
    plan: string;
    openWorkOrders: number;
    activeWorkers: number;
  }>;
  priorityActions: Array<{
    label: string;
    description: string;
    severity: 'success' | 'info' | 'warn' | 'danger' | 'contrast';
  }>;
}

export interface PropertyOwner {
  id: string;
  displayName: string;
  email?: string;
  phone?: string;
  billingEmail?: string;
  notes?: string;
  propertyCount: number;
  active: boolean;
}

export interface CreatePropertyOwnerRequest {
  displayName: string;
  email?: string;
  phone?: string;
  billingEmail?: string;
  notes?: string;
}

export interface PropertyRecord {
  id: string;
  ownerId: string;
  ownerName: string;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  provinceCode?: string;
  postalCode?: string;
  countryCode: string;
  serviceNotes?: string;
  active: boolean;
  services: PropertyServiceAssignment[];
}

export interface CreatePropertyRequest {
  ownerId: string;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  provinceCode?: string;
  postalCode?: string;
  countryCode?: string;
  serviceNotes?: string;
}

export interface PropertyServiceAssignment {
  id: string;
  serviceTypeId: string;
  serviceName: string;
  categoryId?: string;
  categoryName?: string;
  defaultDurationMinutes: number;
  basePrice?: number;
  notes?: string;
  active: boolean;
}

export interface UpdatePropertyServicesRequest {
  serviceTypeIds: string[];
}

export interface ServiceCatalog {
  categories: ServiceCategory[];
  serviceTypes: ServiceType[];
}

export interface CreateServiceCategoryRequest {
  name: string;
}

export interface CreateServiceTypeRequest {
  categoryId?: string;
  name: string;
  description?: string;
  defaultDurationMinutes?: number;
  basePrice?: number;
}

export interface ServiceCategory {
  id: string;
  name: string;
  active: boolean;
}

export interface ServiceType {
  id: string;
  categoryId?: string;
  categoryName?: string;
  name: string;
  description?: string;
  defaultDurationMinutes: number;
  basePrice?: number;
  active: boolean;
}

export interface InventoryCatalog {
  categories: InventoryCategory[];
  items: InventoryItem[];
}

export interface InventoryCategory {
  id: string;
  name: string;
}

export interface InventoryItem {
  id: string;
  categoryId?: string;
  categoryName?: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  reorderLevel?: number;
  storageLocation?: string;
}

export interface CreateInventoryCategoryRequest {
  name: string;
}

export interface CreateInventoryItemRequest {
  categoryId?: string;
  name: string;
  unit: string;
  quantityOnHand: number;
  reorderLevel?: number;
  storageLocation?: string;
}

export interface AssetCatalog {
  assets: TenantAsset[];
  workers: WorkerOption[];
}

export interface TenantAsset {
  id: string;
  assetType: string;
  name: string;
  identifier?: string;
  quantityOnHand: number;
  storageLocation?: string;
  assignedWorkerId?: string;
  assignedWorkerName?: string;
  active: boolean;
}

export interface AuditLogRecord {
  id: string;
  tenantId: string;
  actorUserId?: string;
  actorName?: string;
  actorEmail?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WorkerOption {
  id: string;
  displayName: string;
  employeeNumber?: string;
}

export interface CreateAssetRequest {
  assetType: string;
  name: string;
  identifier?: string;
  quantityOnHand?: number;
  storageLocation?: string;
  assignedWorkerId?: string;
}

export interface WorkerRecord {
  id: string;
  employeeNumber?: string;
  displayName: string;
  phone?: string;
  email?: string;
  appLoginEnabled: boolean;
  status: 'ACTIVE' | 'INACTIVE' | string;
  engagementType: WorkerEngagementType;
  maxWeeklyHours?: number;
  hourlyRate?: number;
  hireDate?: string;
  leaveStartDate?: string;
  leaveEndDate?: string;
  leaveReason?: string;
  emergencyContact?: WorkerEmergencyContact;
  certifications: WorkerCertification[];
  serviceSkills: WorkerServiceSkill[];
  shifts: WorkerShiftTemplate[];
}

export type WorkerEngagementType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACTOR' | 'SEASONAL';

export interface WorkerEmergencyContact {
  contactName: string;
  relationship?: string;
  phone: string;
}

export interface WorkerCertification {
  id?: string;
  certificationName: string;
  issuedBy?: string;
  issuedOn?: string;
  expiresOn?: string;
}

export interface WorkerServiceSkill {
  serviceTypeId: string;
  serviceName: string;
  categoryName?: string;
  skillLevel: string;
}

export interface WorkerShiftTemplate {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  active: boolean;
}

export interface CreateWorkerRequest {
  employeeNumber?: string;
  displayName: string;
  phone?: string;
  email?: string;
  engagementType?: WorkerEngagementType;
  maxWeeklyHours?: number;
  hourlyRate?: number;
  hireDate?: string;
  emergencyContact?: WorkerEmergencyContact;
  certifications?: Omit<WorkerCertification, 'id'>[];
  serviceTypeIds?: string[];
  shifts?: Array<Pick<WorkerShiftTemplate, 'dayOfWeek' | 'startTime' | 'endTime' | 'timezone'>>;
}

export interface UpdateWorkerStatusRequest {
  status: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'TERMINATED' | string;
  leaveStartDate?: string;
  leaveEndDate?: string;
  leaveReason?: string;
}

export interface WorkOrderRecord {
  id: string;
  workOrderNumber: string;
  ownerId: string;
  ownerName: string;
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  serviceTypeId?: string;
  serviceName?: string;
  title: string;
  description?: string;
  status: WorkOrderStatus;
  source: WorkOrderSource;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  scheduledStart?: string;
  scheduledEnd?: string;
  requesterName?: string;
  requesterEmail?: string;
  requesterPhone?: string;
  recurrenceRule?: string;
  recurrenceInterval?: number;
  recurrenceUntil?: string;
  assignments: WorkOrderAssignment[];
  materials: WorkOrderMaterial[];
  assets: WorkOrderAsset[];
  tasks: WorkOrderTask[];
}

export interface WorkOrderReview {
  workOrder: WorkOrderRecord;
  fieldNotes: WorkOrderReviewFieldNote[];
  evidence: WorkOrderEvidence[];
  timeEntries: WorkOrderTimeEntry[];
  invoices: WorkOrderInvoice[];
  communications: WorkOrderCommunication[];
  auditLogs: WorkOrderAuditEntry[];
}

export interface WorkOrderReviewFieldNote {
  id: string;
  workerId?: string;
  workerName: string;
  workerEmail?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderEvidence {
  documentId: string;
  documentType: 'WORK_PHOTO' | 'PURCHASE_RECEIPT';
  photoType?: 'BEFORE' | 'AFTER' | 'ISSUE' | 'OTHER';
  caption?: string;
  bucket: string;
  objectKey: string;
  viewUrl?: string;
  contentType?: string;
  byteSize?: number;
  workerId?: string;
  createdByName?: string;
  createdByEmail?: string;
  capturedAt?: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface WorkOrderTimeEntry {
  id: string;
  workerId?: string;
  workerName: string;
  entryType: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes?: number;
}

export interface WorkOrderInvoice {
  id: string;
  invoiceNumber: string;
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  issuedOn?: string;
  dueOn?: string;
  subtotal: string;
  taxTotal: string;
  total: string;
}

export interface WorkOrderCommunication {
  id: string;
  communicationType: 'WORK_ORDER_COMPLETION' | 'INVOICE_EMAIL' | 'OWNER_EMAIL';
  invoiceId?: string;
  invoiceNumber?: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: 'RECORDED' | 'SENT' | 'FAILED' | string;
  providerMessage?: string;
  sentAt?: string;
  createdAt: string;
}

export interface SendWorkOrderOwnerEmailRequest {
  note?: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  status: 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
  issuedOn?: string;
  dueOn?: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  customerId: string;
  ownerName: string;
  ownerEmail?: string;
  ownerBillingEmail?: string;
  workOrderId?: string;
  workOrderNumber?: string;
  workOrderTitle?: string;
  propertyName?: string;
  propertyAddress?: string;
  createdAt: string;
  lines: InvoiceLineRecord[];
}

export interface InvoiceLineRecord {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoiceLineRequest {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface EmailTemplateRecord {
  id: string;
  templateKey: string;
  name: string;
  subject: string;
  body: string;
  active: boolean;
  updatedAt: string;
}

export interface UpdateEmailTemplateRequest {
  subject: string;
  body: string;
}

export interface SendInvoiceEmailRequest {
  templateId?: string;
  recipientEmail?: string;
  subject?: string;
  body?: string;
}

export interface SendInvoiceEmailResponse {
  deliveryLogId: string;
  status: 'RECORDED' | 'SENT' | 'FAILED';
  recipientEmail: string;
  sentAt?: string;
}

export interface WorkOrderAuditEntry {
  id: string;
  actorUserId?: string;
  actorName?: string;
  actorEmail?: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WorkOrderReviewActionRequest {
  action: 'APPROVE' | 'APPROVE_AND_INVOICE' | 'SEND_BACK' | 'OVERRIDE_COMPLETE';
  note?: string;
}

export interface RecurringWorkTemplate {
  id: string;
  propertyId: string;
  propertyName: string;
  ownerName: string;
  serviceTypeId?: string;
  serviceName?: string;
  title: string;
  description?: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  recurrenceRule: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  recurrenceInterval: number;
  startDate: string;
  endDate?: string;
  preferredStartTime?: string;
  durationMinutes: number;
  generateDaysAhead: number;
  lastGeneratedFor?: string;
  active: boolean;
}

export interface CreateRecurringWorkTemplateRequest {
  propertyId: string;
  serviceTypeId?: string;
  title: string;
  description?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  recurrenceRule: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  recurrenceInterval?: number;
  startDate: string;
  endDate?: string;
  preferredStartTime?: string;
  durationMinutes?: number;
  generateDaysAhead?: number;
}

export interface RecurringWorkGenerationResult {
  generatedCount: number;
  throughDate: string;
  drafts: GeneratedRecurringDraft[];
}

export interface GeneratedRecurringDraft {
  workOrderId: string;
  workOrderNumber: string;
  templateId: string;
  title: string;
  propertyId: string;
  propertyName: string;
  serviceTypeId?: string;
  serviceName?: string;
  occurrenceDate: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface WorkOrderAssignment {
  workerId: string;
  workerName: string;
  workerEmail?: string;
  leadWorker: boolean;
  assignmentStatus: string;
  assignmentRole?: string;
  notes?: string;
}

export interface WorkerAvailabilityOption {
  workerId: string;
  displayName: string;
  employeeNumber?: string;
  engagementType: WorkerEngagementType;
  skillMatched: boolean;
  shiftCovered: boolean;
  scheduleConflict: boolean;
  available: boolean;
  reason: string;
}

export interface WorkOrderMaterial {
  id: string;
  inventoryItemId?: string;
  itemName?: string;
  description: string;
  quantity: number;
  unit?: string;
  unitCost?: number;
  used: boolean;
  usedAt?: string;
}

export interface WorkOrderAsset {
  assetId: string;
  assetType: string;
  name: string;
  identifier?: string;
}

export interface WorkOrderTask {
  id: string;
  parentTaskId?: string;
  assignedWorkerId?: string;
  assignedWorkerName?: string;
  label: string;
  sortOrder: number;
  phase: 'PRE_START' | 'COMPLETION';
  required: boolean;
  completed: boolean;
  taskStatus: 'TO_DO' | 'IN_PROGRESS' | 'ON_HOLD' | 'PENDING_COMPLETION' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
}

export interface CreateWorkOrderRequest {
  propertyId: string;
  serviceTypeId?: string;
  assignedWorkerId?: string;
  assignedWorkerIds?: string[];
  leadWorkerId?: string;
  title: string;
  description?: string;
  source?: WorkOrderSource;
  status?: WorkOrderStatus;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  scheduledStart?: string;
  scheduledEnd?: string;
  requesterName?: string;
  requesterEmail?: string;
  requesterPhone?: string;
  recurrenceRule?: string;
  recurrenceInterval?: number;
  recurrenceUntil?: string;
  materials?: CreateWorkOrderMaterialRequest[];
  assetIds?: string[];
  tasks?: string[];
  taskItems?: CreateWorkOrderTaskRequest[];
  allowAvailabilityOverride?: boolean;
  allowAvailabilityOverrideReason?: string;
}

export interface CancelWorkOrderRequest {
  reason: string;
}

export interface CreateWorkOrderMaterialRequest {
  id?: string;
  inventoryItemId?: string;
  description?: string;
  quantity: number;
  unitCost?: number;
}

export interface CreateWorkOrderTaskRequest {
  id?: string;
  label: string;
  parentIndex?: number;
  assignedWorkerId?: string;
  phase?: 'PRE_START' | 'COMPLETION';
  required?: boolean;
  notes?: string;
}
