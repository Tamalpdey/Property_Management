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
  profilePhotoUrl?: string;
  email: string;
  roles: LorneRole[];
  permissions: string[];
}

export type TenantAssignableRole = 'TENANT_ADMIN' | 'OPERATIONS' | 'FINANCE' | 'FIELD_WORKER' | 'CUSTOMER';

export interface TenantUserRecord {
  id: string;
  displayName: string;
  profilePhotoUrl?: string;
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
  profilePhotoUrl?: string;
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

export type CommunicationChannelType = 'WORK_ORDER' | 'WORKER_OPERATIONS' | 'WORKER_DIRECT' | 'ANNOUNCEMENT';

export interface ConversationParticipant {
  userId: string;
  workerId?: string;
  displayName: string;
  email: string;
  participantRole: string;
  lastReadAt?: string;
}

export interface ConversationRecord {
  id: string;
  channelType: CommunicationChannelType;
  workOrderId?: string;
  workOrderNumber?: string;
  title: string;
  lastMessagePreview?: string;
  lastMessageAt?: string;
  unreadCount: number;
  participants: ConversationParticipant[];
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  senderWorkerId?: string;
  senderName: string;
  senderEmail: string;
  senderRole: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface ConversationThread {
  conversation: ConversationRecord;
  messages: ConversationMessage[];
}

export interface CreateConversationRequest {
  channelType?: CommunicationChannelType;
  workOrderId?: string;
  participantUserIds?: string[];
  title?: string;
  initialMessage?: string;
}

export interface SendMessageRequest {
  body: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  tenantId?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: number;
  refreshExpiresInSeconds: number;
  user: CurrentUser;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken?: string;
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
  | 'ARRIVE_ROUTE_STOP'
  | 'COMPLETE_ROUTE_STOP'
  | 'SKIP_ROUTE_STOP'
  | 'ADD_NOTE'
  | 'ADD_MATERIAL_USED'
  | 'RETURN_TOOL'
  | 'ADD_PHOTO'
  | 'ADD_PURCHASE_RECEIPT'
  | 'UPDATE_NOTE'
  | 'LEAVE_EMERGENCY'
  | 'VIEW_DISPATCH'
  | 'VIEW_LINKED_WORK_ORDERS'
  | 'VIEW_PRE_START_CHECKLIST'
  | 'VIEW_COMPLETION_CHECKLIST'
  | 'VIEW_TIMELINE';

export interface WorkerShiftClockState {
  clockedIn: boolean;
  entryId?: string;
  startedAt?: string;
  endedAt?: string;
  paused?: boolean;
  pauseId?: string;
  pausedAt?: string;
  pauseMinutes?: number;
  activeMinutes?: number;
}

export interface WorkerShiftClockRequest {
  latitude?: number;
  longitude?: number;
  locationAccuracyMeters?: number;
  deviceTimestamp?: string;
  userAgent?: string;
  platform?: string;
  note?: string;
}

export interface WorkerAssignedJob {
  id: string;
  workOrderNumber: string;
  workOrderType: WorkOrderType;
  title: string;
  propertyCode: string;
  propertyName: string;
  ownerCode: string;
  ownerName: string;
  address: string;
  propertyLatitude?: number;
  propertyLongitude?: number;
  serviceName?: string;
  maintenanceRecordTemplate?: MaintenanceRecordTemplate;
  status: WorkOrderStatus;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  scheduledStart?: string;
  scheduledEnd?: string;
  estimatedTravelMinutes?: number;
  estimatedTravelDistanceMeters?: number;
  travelEstimateProvider?: string;
  travelEstimatedAt?: string;
  notes?: string;
  leadWorker: boolean;
  assignmentStatus: string;
  checklist: WorkerJobChecklistItem[];
  materials: WorkerJobMaterial[];
  assets: WorkerJobAsset[];
  routeStops: WorkOrderRouteStop[];
  linkedWorkOrders: WorkOrderLink[];
  linkedFromWorkOrders: WorkOrderLink[];
  fieldNotes: WorkerFieldNote[];
  evidence: WorkerJobEvidence[];
  executionEvents: WorkerExecutionEvent[];
}

export interface WorkOrderMaintenanceRecord {
  id: string;
  workOrderId: string;
  workerId?: string;
  actorUserId?: string;
  workerName: string;
  workerEmail?: string;
  templateSnapshot: MaintenanceRecordTemplate;
  recordData: MaintenanceRecordData;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceRecordData {
  serviceDetails?: string;
  callTypes?: Record<string, boolean>;
  otherCallType?: string;
  serviceChecks?: Record<string, boolean>;
  measurements?: Record<string, string>;
  chemicalValues?: Record<string, string>;
  adjusted?: Record<string, boolean>;
  withinRange?: Record<string, boolean>;
  deliveries?: Record<string, string>;
  clientNote?: string;
}

export interface UpsertWorkOrderMaintenanceRecordRequest {
  templateSnapshot: MaintenanceRecordTemplate;
  recordData: MaintenanceRecordData;
  note?: string;
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

export interface WorkOrderRouteStop {
  id: string;
  stopOrder: number;
  stopType: 'PICKUP' | 'DELIVERY' | 'RETURN' | 'KEYS' | 'SUPPLIER' | 'WAREHOUSE' | 'OWNER' | 'OTHER';
  name: string;
  address?: string;
  instructions?: string;
  plannedArrival?: string;
  visibleToWorker?: boolean;
  estimatedTravelMinutes?: number;
  estimatedTravelDistanceMeters?: number;
  travelEstimateProvider?: string;
  travelEstimatedAt?: string;
  arrivedAt?: string;
  completedAt?: string;
  skippedAt?: string;
  skippedReason?: string;
}

export interface WorkerJobActionRequest {
  action: WorkerJobAction;
  note?: string;
  noteId?: string;
  taskId?: string;
  routeStopId?: string;
  materialId?: string;
  inventoryItemId?: string;
  materialDescription?: string;
  quantity?: number;
  unitCost?: number;
  billingCost?: number;
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
  autoDetected?: boolean;
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
  metadata?: Record<string, unknown>;
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

export interface WorkerDailyLoadout {
  id: string;
  date: string;
  workerId: string;
  workerName: string;
  status: 'PLANNED' | 'PARTIAL' | 'CHECKED_OUT' | 'RETURNED' | 'ISSUE_REPORTED' | string;
  scheduledJobs: number;
  toolCount: number;
  checkedOutCount: number;
  returnedCount: number;
  issueCount: number;
  tools: WorkerLoadoutTool[];
  materials: WorkerLoadoutMaterial[];
  activities: WorkerActivity[];
  vehicles: WorkerVehicleOption[];
  vehicleUse?: WorkerVehicleUse;
}

export interface WorkerVehicleOption {
  id: string;
  name: string;
  identifier?: string;
}

export interface WorkerVehicleUse {
  id?: string;
  vehicleAssetId?: string;
  vehicleLabel?: string;
  startKm?: number;
  endKm?: number;
  notes?: string;
}

export interface SaveWorkerVehicleUseRequest {
  vehicleAssetId?: string;
  vehicleLabel?: string;
  startKm?: number;
  endKm?: number;
  notes?: string;
}

export interface WorkerLoadoutTool {
  assetId: string;
  workOrderId: string;
  workOrderNumber: string;
  workOrderTitle: string;
  propertyName: string;
  assetType: string;
  name: string;
  identifier?: string;
  status: 'PLANNED' | 'CHECKED_OUT' | 'RETURNED' | 'DAMAGED' | 'MISSING' | string;
  issueNote?: string;
}

export interface WorkerLoadoutMaterial {
  materialId: string;
  inventoryItemId?: string;
  workOrderId: string;
  workOrderNumber: string;
  workOrderTitle: string;
  propertyName: string;
  itemName?: string;
  description?: string;
  quantity: number;
  unit?: string;
  used: boolean;
}

export interface WorkerLoadoutToolActionRequest {
  workOrderId: string;
  assetId: string;
  note?: string;
}

export interface WorkerActivity {
  id: string;
  activityType: 'OFFICE' | 'SUPPLIER' | 'SHOP' | 'WAREHOUSE' | 'TRAVEL' | 'BREAK' | 'OTHER' | string;
  title: string;
  locationName?: string;
  address?: string;
  notes?: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes?: number;
  open: boolean;
}

export interface WorkerActivityRecord extends WorkerActivity {
  workerId: string;
  override?: boolean;
  overrideReason?: string;
  overrideUpdatedAt?: string;
}

export interface WorkerActivityRequest {
  activityType?: 'OFFICE' | 'SUPPLIER' | 'SHOP' | 'WAREHOUSE' | 'TRAVEL' | 'BREAK' | 'OTHER' | string;
  title?: string;
  locationName?: string;
  address?: string;
  notes?: string;
}

export interface WorkerActivityOverrideRequest extends WorkerActivityRequest {
  activityId?: string;
  delete?: boolean;
  startedAt?: string;
  endedAt?: string;
  reason: string;
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

export type NewTenantStatus = 'TRIAL' | 'ACTIVE';

export interface CreateTenantOnboardingRequest {
  legalName: string;
  displayName: string;
  portalSubdomain: string;
  planCode: string;
  status: NewTenantStatus;
  timezone: string;
  countryCode: string;
  provinceCode?: string;
  adminDisplayName: string;
  adminEmail: string;
  adminPhone?: string;
  temporaryPassword: string;
  billingEmail?: string;
  supportEmail?: string;
  companyPhone?: string;
  websiteUrl?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  themePrimaryColor?: string;
  themeAccentColor?: string;
  themeNavigationColor?: string;
  loginHeadline?: string;
  loginMessage?: string;
}

export interface TenantOnboardingResult {
  tenantId: string;
  displayName: string;
  portalSubdomain: string;
  status: NewTenantStatus;
  planCode: string;
  administratorUserId: string;
  administratorEmail: string;
}

export interface SuperAdminTenantSummary {
  id: string;
  legalName: string;
  displayName: string;
  portalSubdomain: string;
  status: string;
  planCode: string;
  timezone: string;
  countryCode: string;
  provinceCode?: string;
  administratorEmail?: string;
  activeUsers: number;
  activeProperties: number;
  createdAt: string;
}

export interface PropertyOwner {
  id: string;
  ownerCode: string;
  displayName: string;
  email?: string;
  phone?: string;
  billingEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  provinceCode?: string;
  postalCode?: string;
  countryCode?: string;
  notes?: string;
  propertyCount: number;
  active: boolean;
}

export interface CreatePropertyOwnerRequest {
  displayName: string;
  email?: string;
  phone?: string;
  billingEmail?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  provinceCode?: string;
  postalCode?: string;
  countryCode?: string;
  notes?: string;
}

export interface PropertyRecord {
  id: string;
  propertyCode: string;
  ownerId: string;
  ownerCode: string;
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
  wsibRatePercent?: number | null;
  maintenanceRecordTemplate?: MaintenanceRecordTemplate;
}

export interface CreateServiceTypeRequest {
  categoryId?: string;
  name: string;
  description?: string;
  defaultDurationMinutes?: number;
  basePrice?: number;
  maintenanceRecordTemplate?: MaintenanceRecordTemplate;
}

export interface UpdateServiceTypeStatusRequest {
  active: boolean;
}

export interface UpdateServiceCategoryStatusRequest {
  active: boolean;
}

export interface ServiceCategory {
  id: string;
  name: string;
  wsibRatePercent?: number | null;
  maintenanceRecordTemplate?: MaintenanceRecordTemplate;
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
  maintenanceRecordTemplate?: MaintenanceRecordTemplate;
  active: boolean;
}

export interface MaintenanceRecordTemplate {
  enabled: boolean;
  title?: string;
  callTypes?: MaintenanceTemplateOption[];
  checks?: MaintenanceTemplateItem[];
  measurements?: MaintenanceTemplateMeasurement[];
  chemicals?: MaintenanceTemplateChemical[];
  deliveries?: MaintenanceTemplateDelivery[];
  noteLabel?: string;
}

export interface MaintenanceTemplateOption {
  key: string;
  label: string;
  defaultSelected?: boolean;
  match?: string[];
}

export interface MaintenanceTemplateItem {
  key: string;
  label: string;
  defaultSelected?: boolean;
  match?: string[];
}

export interface MaintenanceTemplateMeasurement {
  key: string;
  label: string;
  unit?: string;
}

export interface MaintenanceTemplateChemical {
  key: string;
  label: string;
  unit?: string;
}

export interface MaintenanceTemplateDelivery {
  key: string;
  label: string;
  inventoryKeywords?: string[];
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
  unitCost?: number;
  billingCost?: number;
  quantityOnHand: number;
  reorderLevel?: number;
  storageLocation?: string;
  active: boolean;
}

export interface CreateInventoryCategoryRequest {
  name: string;
}

export interface CreateInventoryItemRequest {
  categoryId?: string;
  name: string;
  unit: string;
  unitCost?: number;
  billingCost?: number;
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

export interface UpdateInventoryItemStatusRequest {
  active: boolean;
}

export interface UpdateAssetStatusRequest {
  active: boolean;
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

export interface WorkerClockEntryRecord {
  id: string;
  workerId: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes?: number;
  pauseMinutes?: number;
  override?: boolean;
  overrideReason?: string;
  overrideUpdatedAt?: string;
}

export interface WorkerClockEntryOverrideRequest {
  startedAt: string;
  endedAt: string;
  reason: string;
}

export interface WorkerClockedInTodayRecord {
  workerId: string;
  workerName: string;
  employeeNumber?: string;
  email?: string;
  startedAt: string;
  paused: boolean;
  pausedAt?: string;
  grossMinutes: number;
  pauseMinutes: number;
  netMinutes: number;
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

export interface RefreshWorkOrderTravelEstimatesRequest {
  workOrderIds: string[];
}

export interface WorkOrderRecord {
  id: string;
  workOrderNumber: string;
  workOrderType: WorkOrderType;
  ownerId: string;
  ownerCode: string;
  ownerName: string;
  propertyId: string;
  propertyCode: string;
  propertyName: string;
  propertyAddress: string;
  propertyLatitude?: number;
  propertyLongitude?: number;
  serviceTypeId?: string;
  serviceName?: string;
  maintenanceRecordTemplate?: MaintenanceRecordTemplate;
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
  routeStops: WorkOrderRouteStop[];
  linkedWorkOrders: WorkOrderLink[];
  linkedFromWorkOrders: WorkOrderLink[];
  fieldNotes?: WorkOrderReviewFieldNote[];
}

export interface WorkOrderLink {
  linkedWorkOrderId: string;
  workOrderNumber: string;
  title: string;
  propertyName: string;
  status: WorkOrderStatus;
  linkType: 'RELATED' | 'BLOCKS' | 'FOLLOWS' | 'SAME_RECURRENCE' | 'PICKUP_FOR';
  notes?: string;
}

export type WorkOrderType = 'SERVICE' | 'PICKUP_DELIVERY' | 'INSPECTION' | 'FOLLOW_UP';

export interface WorkOrderReview {
  workOrder: WorkOrderRecord;
  fieldNotes: WorkOrderReviewFieldNote[];
  maintenanceRecords: WorkOrderMaintenanceRecord[];
  evidence: WorkOrderEvidence[];
  workerActivities: WorkerActivityRecord[];
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
  serviceName?: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: 'RECORDED' | 'SENT' | 'FAILED' | string;
  providerMessage?: string;
  deliveryMode?: 'AUTO' | 'MANUAL' | 'RESEND' | 'TEST' | string;
  sentAt?: string;
  createdAt: string;
}

export interface SendWorkOrderOwnerEmailRequest {
  note?: string;
  recipientEmail?: string;
  ccEmails?: string;
  bccEmails?: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issuedOn?: string;
  dueOn?: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  paidTotal: number;
  balanceDue: number;
  customerId: string;
  ownerCode?: string;
  ownerName: string;
  ownerEmail?: string;
  ownerBillingEmail?: string;
  ownerAddress?: string;
  workOrderId?: string;
  workOrderNumber?: string;
  workOrderTitle?: string;
  propertyCode?: string;
  propertyName?: string;
  propertyAddress?: string;
  createdAt: string;
  workOrders: InvoiceWorkOrderRecord[];
  lines: InvoiceLineRecord[];
  payments: InvoicePaymentRecord[];
}

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID';

export interface InvoiceWorkOrderRecord {
  workOrderId: string;
  workOrderNumber: string;
  title: string;
  propertyCode?: string;
  propertyName?: string;
  propertyAddress?: string;
  status?: string;
  serviceName?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
}

export interface InvoiceLineRecord {
  id: string;
  workOrderId?: string;
  lineType: 'LABOR' | 'MATERIAL' | 'CUSTOM' | 'DISCOUNT';
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  taxable: boolean;
  taxRate: number;
}

export interface InvoiceLineRequest {
  lineType?: 'LABOR' | 'MATERIAL' | 'CUSTOM' | 'DISCOUNT';
  description: string;
  quantity: number;
  unitPrice: number;
  taxable?: boolean;
  taxRate?: number;
}

export interface CreateBatchInvoiceRequest {
  ownerId: string;
  propertyId?: string;
  workOrderIds: string[];
  additionalLines?: InvoiceLineRequest[];
  issuedOn?: string;
  dueOn?: string;
}

export interface BulkInvoicePreviewRequest {
  fromDate?: string;
  toDate?: string;
  ownerIds?: string[];
}

export interface BulkInvoicePreviewRecord {
  fromDate: string;
  toDate: string;
  ownerCount: number;
  workOrderCount: number;
  estimatedSubtotal: number;
  owners: BulkInvoiceOwnerGroupRecord[];
}

export interface BulkInvoiceOwnerGroupRecord {
  ownerId: string;
  ownerCode?: string;
  ownerName: string;
  ownerEmail?: string;
  ownerBillingEmail?: string;
  workOrderCount: number;
  estimatedSubtotal: number;
  workOrders: BulkInvoiceWorkOrderRecord[];
}

export interface BulkInvoiceWorkOrderRecord {
  workOrderId: string;
  workOrderNumber: string;
  title: string;
  status: WorkOrderStatus;
  propertyId: string;
  propertyCode?: string;
  propertyName: string;
  propertyAddress?: string;
  serviceName?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  estimatedSubtotal: number;
}

export interface CreateBulkInvoicesRequest {
  fromDate?: string;
  toDate?: string;
  ownerIds?: string[];
  workOrderIds: string[];
  issuedOn?: string;
  dueOn?: string;
}

export interface CreateBulkInvoicesResponse {
  invoices: InvoiceRecord[];
  skippedWorkOrderCount: number;
}

export interface InvoicePaymentRecord {
  id: string;
  status: 'PENDING' | 'RECEIVED' | 'FAILED' | 'REFUNDED';
  paymentMethod: 'CASH' | 'CHEQUE' | 'E_TRANSFER' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
  amount: number;
  paidAt?: string;
  reference?: string;
  note?: string;
  createdAt: string;
}

export interface RecordInvoicePaymentRequest {
  amount: number;
  paymentMethod: 'CASH' | 'CHEQUE' | 'E_TRANSFER' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
  paidAt?: string;
  reference?: string;
  note?: string;
}

export interface UpdateInvoiceStatusRequest {
  status: InvoiceStatus;
  reason?: string;
}

export interface OwnerStatementRecord {
  ownerId: string;
  ownerName: string;
  ownerEmail?: string;
  ownerBillingEmail?: string;
  invoicedTotal: number;
  paidTotal: number;
  balanceDue: number;
  invoices: InvoiceRecord[];
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

export interface TenantSettingsRecord {
  tenantName: string;
  legalName: string;
  timezone: string;
  countryCode: string;
  portalSubdomain: string;
  organizationName?: string;
  billingEmail?: string;
  supportEmail?: string;
  phone?: string;
  websiteUrl?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  provinceCode?: string;
  postalCode?: string;
  invoicePrefix: string;
  invoiceTaxRate: number;
  taxRegistrationNumber?: string;
  invoiceFooter?: string;
  paymentTerms?: string;
  logoUrl?: string;
  dayTicketShowCompanyName: boolean;
  dayTicketShowCompanyAddress: boolean;
  dayTicketShowDailyLoadout: boolean;
  serviceRecordShowCompanyName: boolean;
  serviceRecordShowCompanyAddress: boolean;
  invoiceShowCompanyName: boolean;
  invoiceShowCompanyAddress: boolean;
  themePrimaryColor: string;
  themeAccentColor: string;
  themeNavigationColor: string;
  themeSurfaceColor: string;
  themePageBackgroundColor: string;
  themeDensity: 'COMPACT' | 'COMFORTABLE' | 'SPACIOUS';
  themeRadius: 'SHARP' | 'SMALL' | 'ROUNDED';
  dashboardWidgetOrder: DashboardWidgetId[];
  dashboardHiddenWidgets: DashboardWidgetId[];
  loginStyle: 'SPLIT' | 'FOCUSED' | 'MINIMAL';
  loginHeadline: string;
  loginMessage: string;
  loginBackgroundPattern: 'GRID' | 'SUBTLE' | 'NONE';
  loginShowPreview: boolean;
  emailProvider: 'SYSTEM' | 'TENANT_SMTP' | 'TENANT_GRAPH';
  emailSenderName?: string;
  emailFromAddress?: string;
  emailReplyToAddress?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPasswordConfigured: boolean;
  smtpUseTls: boolean;
  graphTenantId?: string;
  graphClientId?: string;
  graphClientSecretConfigured: boolean;
  graphSenderUser?: string;
  autoSendWorkCompletedEmail: boolean;
  autoSendInvoiceEmail: boolean;
  liveWorkerTrackingEnabled: boolean;
}

export interface UpdateTenantSettingsRequest {
  organizationName?: string;
  portalSubdomain?: string;
  billingEmail?: string;
  supportEmail?: string;
  phone?: string;
  websiteUrl?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  provinceCode?: string;
  postalCode?: string;
  countryCode?: string;
  invoicePrefix?: string;
  invoiceTaxRate?: number;
  taxRegistrationNumber?: string;
  invoiceFooter?: string;
  paymentTerms?: string;
  logoUrl?: string;
  dayTicketShowCompanyName?: boolean;
  dayTicketShowCompanyAddress?: boolean;
  dayTicketShowDailyLoadout?: boolean;
  serviceRecordShowCompanyName?: boolean;
  serviceRecordShowCompanyAddress?: boolean;
  invoiceShowCompanyName?: boolean;
  invoiceShowCompanyAddress?: boolean;
  themePrimaryColor?: string;
  themeAccentColor?: string;
  themeNavigationColor?: string;
  themeSurfaceColor?: string;
  themePageBackgroundColor?: string;
  themeDensity?: 'COMPACT' | 'COMFORTABLE' | 'SPACIOUS';
  themeRadius?: 'SHARP' | 'SMALL' | 'ROUNDED';
  dashboardWidgetOrder?: DashboardWidgetId[];
  dashboardHiddenWidgets?: DashboardWidgetId[];
  loginStyle?: 'SPLIT' | 'FOCUSED' | 'MINIMAL';
  loginHeadline?: string;
  loginMessage?: string;
  loginBackgroundPattern?: 'GRID' | 'SUBTLE' | 'NONE';
  loginShowPreview?: boolean;
  emailProvider?: 'SYSTEM' | 'TENANT_SMTP' | 'TENANT_GRAPH';
  emailSenderName?: string;
  emailFromAddress?: string;
  emailReplyToAddress?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpPassword?: string;
  clearSmtpPassword?: boolean;
  smtpUseTls?: boolean;
  graphTenantId?: string;
  graphClientId?: string;
  graphClientSecret?: string;
  clearGraphClientSecret?: boolean;
  graphSenderUser?: string;
  autoSendWorkCompletedEmail?: boolean;
  autoSendInvoiceEmail?: boolean;
  liveWorkerTrackingEnabled?: boolean;
}

export type DashboardWidgetId =
  | 'metrics'
  | 'actionQueue'
  | 'clockedIn'
  | 'workMix'
  | 'topServices'
  | 'finance'
  | 'workerLoad'
  | 'inventoryRisk';

export interface TenantLoginBrandingRecord {
  tenantId: string;
  portalSubdomain: string;
  organizationName: string;
  websiteUrl?: string;
  logoUrl?: string;
  themePrimaryColor: string;
  themeAccentColor: string;
  themeNavigationColor: string;
  themePageBackgroundColor: string;
  themeRadius: 'SHARP' | 'SMALL' | 'ROUNDED';
  loginStyle: 'SPLIT' | 'FOCUSED' | 'MINIMAL';
  loginHeadline: string;
  loginMessage: string;
  loginBackgroundPattern: 'GRID' | 'SUBTLE' | 'NONE';
  loginShowPreview: boolean;
}

export interface TestTenantEmailRequest {
  recipientEmail?: string;
  subject?: string;
  body?: string;
}

export interface TestTenantEmailResponse {
  deliveryLogId: string;
  status: 'RECORDED' | 'SENT' | 'FAILED';
  recipientEmail: string;
  sentAt?: string;
  providerMessage?: string;
}

export interface SendInvoiceEmailRequest {
  templateId?: string;
  recipientEmail?: string;
  ccEmails?: string;
  bccEmails?: string;
  subject?: string;
  body?: string;
  deliveryMode?: 'AUTO' | 'MANUAL' | 'RESEND' | 'TEST' | string;
}

export interface SendInvoiceEmailResponse {
  deliveryLogId: string;
  status: 'RECORDED' | 'SENT' | 'FAILED';
  recipientEmail: string;
  sentAt?: string;
}

export interface EmailDeliveryLogRecord {
  id: string;
  communicationType: 'WORK_ORDER_COMPLETION' | 'INVOICE_EMAIL' | 'TEST_EMAIL' | 'OWNER_EMAIL' | string;
  deliveryMode: 'AUTO' | 'MANUAL' | 'RESEND' | 'TEST' | string;
  invoiceId?: string;
  invoiceNumber?: string;
  workOrderId?: string;
  workOrderNumber?: string;
  serviceName?: string;
  ownerName?: string;
  recipientEmail: string;
  ccEmails?: string;
  bccEmails?: string;
  subject: string;
  body?: string;
  status: 'RECORDED' | 'SENT' | 'FAILED' | string;
  providerMessage?: string;
  sentAt?: string;
  createdAt: string;
}

export interface ResendEmailDeliveryRequest {
  recipientEmail?: string;
  ccEmails?: string;
  bccEmails?: string;
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

export interface WorkOrderEvidenceActionRequest {
  action: 'ADD_PHOTO' | 'ADD_PURCHASE_RECEIPT';
  documentId: string;
  photoType?: 'BEFORE' | 'AFTER' | 'ISSUE' | 'OTHER';
  caption?: string;
  receiptAmount?: number;
  vendorName?: string;
}

export interface WorkOrderFieldOverrideRequest {
  reason: string;
  assignments?: WorkOrderAssignmentOverride[];
  workerActivities?: WorkOrderWorkerActivityOverride[];
  tasks?: WorkOrderTaskOverride[];
  routeStops?: WorkOrderRouteStopOverride[];
  materials?: WorkOrderMaterialOverride[];
  fieldNotes?: WorkOrderFieldNoteOverride[];
}

export interface WorkOrderAssignmentOverride {
  workerId: string;
  assignmentStatus?: string;
  leadWorker?: boolean;
  notes?: string;
  actualArrivedAt?: string;
  actualWorkStartedAt?: string;
  actualFinishedAt?: string;
  actualWorkMinutes?: number;
}

export interface WorkOrderWorkerActivityOverride {
  activityId?: string;
  workerId?: string;
  delete?: boolean;
  activityType?: WorkerActivity['activityType'];
  title?: string;
  locationName?: string;
  address?: string;
  notes?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface WorkOrderTaskOverride {
  taskId: string;
  completed?: boolean;
  taskStatus?: WorkOrderTask['taskStatus'];
  notes?: string;
  completedAt?: string;
}

export interface WorkOrderRouteStopOverride {
  routeStopId?: string;
  delete?: boolean;
  stopType?: WorkOrderRouteStop['stopType'];
  name?: string;
  address?: string;
  instructions?: string;
  plannedArrival?: string;
  visibleToWorker?: boolean;
  arrivedAt?: string;
  completedAt?: string;
  skippedAt?: string;
  skippedReason?: string;
}

export interface WorkOrderMaterialOverride {
  materialId?: string;
  description?: string;
  inventoryItemId?: string;
  used?: boolean;
  usedAt?: string;
  quantity?: number;
  unitCost?: number;
  billingCost?: number;
}

export interface WorkOrderFieldNoteOverride {
  noteId?: string;
  workerId?: string;
  note: string;
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
  actualTravelStartedAt?: string;
  actualArrivedAt?: string;
  actualWorkStartedAt?: string;
  actualFinishedAt?: string;
  actualWorkMinutes?: number;
  estimatedTravelMinutes?: number;
  estimatedTravelDistanceMeters?: number;
  travelEstimateProvider?: string;
  travelEstimatedAt?: string;
  timingOverride?: boolean;
  overrideReason?: string;
  overrideUpdatedAt?: string;
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
  billingCost?: number;
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
  workOrderType?: WorkOrderType;
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
  routeStops?: CreateWorkOrderRouteStopRequest[];
  linkedWorkOrders?: CreateWorkOrderLinkRequest[];
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
  billingCost?: number;
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

export interface CreateWorkOrderRouteStopRequest {
  id?: string;
  stopType?: WorkOrderRouteStop['stopType'];
  name: string;
  address?: string;
  instructions?: string;
  plannedArrival?: string;
  visibleToWorker?: boolean;
}

export interface CreateWorkOrderLinkRequest {
  linkedWorkOrderId: string;
  linkType?: WorkOrderLink['linkType'];
  notes?: string;
}
