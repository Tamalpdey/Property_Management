import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import type { CommunicationChannelType, ConversationRecord, ConversationThread, TenantUserRecord } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { CommunicationService } from './services/communication.service';
import { TenantUserService } from '../users/services/tenant-user.service';

interface ChannelOption {
  value: CommunicationChannelType | 'ALL';
  label: string;
  helper: string;
  icon: string;
}

@Component({
  selector: 'lorne-messages-page',
  standalone: true,
  imports: [ButtonModule, DatePipe, DialogModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="grid min-h-[calc(100vh-4.5rem)] grid-rows-[auto_auto_1fr] gap-2.5">
      <header class="rounded-lg border border-slate-200 bg-slate-950 px-4 py-4 text-white shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs font-black uppercase tracking-wide text-teal-200">Team communications</p>
            <h1 class="mt-1 text-2xl font-black">Messages</h1>
            <p class="mt-1 text-sm font-semibold text-slate-300">Work-order chats, worker questions, announcements, and audited dispatch communication.</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="load()"></button>
            <button pButton type="button" icon="pi pi-plus" label="Start message" (click)="toggleCreate()"></button>
          </div>
        </div>
      </header>

      @if (error()) {
        <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{{ error() }}</div>
      }

      @if (showCreate()) {
        <p-dialog
          header="Start message"
          [modal]="true"
          [visible]="showCreate()"
          [style]="{ width: '64rem', maxWidth: '96vw', height: '42rem', maxHeight: '92vh' }"
          [contentStyle]="{ height: 'calc(100% - 4rem)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }"
          (visibleChange)="onCreateVisible($event)"
        >
        <div class="min-h-0 flex-1 overflow-hidden">
          <div class="grid h-full min-h-0 items-start gap-3 xl:grid-cols-[20rem_1fr]">
            <div class="flex min-h-0 flex-col gap-2">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">What kind of message?</p>
              @for (option of createOptions; track option.value) {
                <button
                  type="button"
                  class="rounded-lg border px-3 py-2 text-left transition"
                  [class.border-teal-400]="newChannel() === option.value"
                  [class.bg-teal-50]="newChannel() === option.value"
                  [class.border-slate-200]="newChannel() !== option.value"
                  [class.bg-slate-50]="newChannel() !== option.value"
                  (click)="setNewChannel(option.value)"
                >
                  <span class="flex items-center gap-2 text-sm font-black text-slate-950">
                    <i [class]="option.icon"></i>
                    {{ option.label }}
                  </span>
                  <span class="mt-1 block text-xs font-semibold text-slate-600">{{ option.helper }}</span>
                </button>
              }
            </div>

            <div class="grid h-full min-h-0 grid-rows-[auto_1fr_auto] gap-3">
              <div class="grid gap-2 lg:grid-cols-[1fr_1fr]">
                <label class="grid gap-1">
                  <span class="text-xs font-black uppercase tracking-wide text-slate-500">Title</span>
                  <input class="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold" placeholder="Example: Route delay, supply question, Friday update" [ngModel]="newTitle()" (ngModelChange)="newTitle.set($event)" />
                </label>
                <label class="grid gap-1">
                  <span class="text-xs font-black uppercase tracking-wide text-slate-500">Find recipients</span>
                  <input class="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold" placeholder="Search name, email, role" [ngModel]="recipientSearch()" (ngModelChange)="recipientSearch.set($event)" />
                </label>
              </div>

              <div class="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div class="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p class="text-xs font-black uppercase tracking-wide text-teal-700">Recipients</p>
                    <p class="text-xs font-semibold text-slate-500">{{ recipientHint() }}</p>
                  </div>
                  <div class="flex flex-wrap items-center justify-end gap-1.5">
                    @if (newChannel() !== 'WORKER_DIRECT') {
                      <button pButton type="button" size="small" text label="All active workers" (click)="selectAllWorkers()"></button>
                    }
                    @if (newChannel() === 'WORKER_OPERATIONS') {
                      <button pButton type="button" size="small" text label="All ops" (click)="selectAllOperations()"></button>
                    }
                    <button pButton type="button" size="small" text severity="secondary" label="Clear" (click)="selectedUserIds.set([])"></button>
                    <span class="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-600">{{ selectedUserIds().length }} selected</span>
                  </div>
                </div>
                <div class="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1 lg:grid-cols-2">
                  @if (recipientOptions().length === 0) {
                    <div class="rounded-md border border-dashed border-slate-300 bg-white p-4 text-center text-xs font-bold text-slate-500 lg:col-span-2">
                      No active recipients match this message type.
                    </div>
                  } @else {
                    @for (user of recipientOptions(); track user.id) {
                      <button
                        type="button"
                        class="flex items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-left"
                        [class.border-teal-400]="isRecipientSelected(user.id)"
                        [class.border-slate-200]="!isRecipientSelected(user.id)"
                        (click)="toggleRecipient(user.id)"
                      >
                        <span class="min-w-0">
                          <span class="block truncate text-sm font-black text-slate-950">{{ user.displayName }}</span>
                          <span class="block truncate text-xs font-semibold text-slate-500">{{ user.email }} · {{ roleSummary(user) }}</span>
                        </span>
                        <i class="pi" [class.pi-check-circle]="isRecipientSelected(user.id)" [class.pi-circle]="!isRecipientSelected(user.id)" [class.text-teal-700]="isRecipientSelected(user.id)" [class.text-slate-300]="!isRecipientSelected(user.id)"></i>
                      </button>
                    }
                  }
                </div>
              </div>

              <div class="grid gap-2 border-t border-slate-200 pt-3">
                <textarea class="min-h-20 rounded-lg border border-slate-300 p-3 text-sm font-semibold" placeholder="Initial message" [ngModel]="newMessage()" (ngModelChange)="newMessage.set($event)"></textarea>
                <div class="flex justify-end">
                  <button pButton type="button" icon="pi pi-send" label="Create conversation" [disabled]="!canCreate()" [loading]="creating()" (click)="create()"></button>
                </div>
              </div>
            </div>
          </div>
        </div>
        </p-dialog>
      }

      <div class="grid min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:grid-cols-[23rem_1fr]">
        <aside class="border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
          <div class="border-b border-slate-200 p-2.5">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-sm font-black text-slate-950">Inbox</h2>
              <span class="rounded-full bg-white px-2.5 py-1 text-xs font-black text-slate-600">{{ conversations().length }} threads</span>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-1">
              @for (option of filterOptions; track option.value) {
                <button
                  type="button"
                  class="rounded-md px-2 py-1.5 text-left text-xs font-black transition"
                  [class.bg-slate-950]="filter() === option.value"
                  [class.text-white]="filter() === option.value"
                  [class.bg-white]="filter() !== option.value"
                  [class.text-slate-600]="filter() !== option.value"
                  (click)="setFilter(option.value)"
                >
                  <i [class]="option.icon + ' mr-1'"></i>{{ option.label }}
                </button>
              }
            </div>
            <p class="mt-2 text-[0.7rem] font-bold text-slate-400">Auto-refreshes every 12 seconds.</p>
          </div>
          <div class="h-full overflow-y-auto p-2">
            @if (loading()) {
              <div class="grid min-h-40 place-items-center text-sm font-bold text-slate-500">
                <i class="pi pi-spin pi-spinner mr-2"></i>
                Loading messages...
              </div>
            } @else if (conversations().length === 0) {
              <div class="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center">
                <p class="text-sm font-black text-slate-700">No {{ filterLabel(filter()).toLowerCase() }} yet.</p>
                <p class="mt-1 text-xs font-semibold text-slate-500">{{ emptyStateHelp(filter()) }}</p>
              </div>
            } @else {
              @for (conversation of conversations(); track conversation.id) {
                <button
                  type="button"
                  class="mb-2 w-full rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-teal-200 hover:bg-teal-50"
                  [class.border-teal-400]="selectedId() === conversation.id"
                  [class.border-slate-200]="selectedId() !== conversation.id"
                  (click)="select(conversation)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="truncate text-sm font-black text-slate-950">{{ conversation.title }}</p>
                      <p class="mt-0.5 text-xs font-bold text-teal-700">{{ channelLabel(conversation.channelType) }}</p>
                    </div>
                    @if (conversation.unreadCount > 0) {
                      <span class="rounded-full bg-teal-600 px-2 py-0.5 text-xs font-black text-white">{{ conversation.unreadCount }}</span>
                    }
                  </div>
                  <p class="mt-2 line-clamp-2 text-xs font-semibold text-slate-600">{{ conversation.lastMessagePreview || 'No messages yet.' }}</p>
                  <p class="mt-2 truncate text-xs font-semibold text-slate-400">{{ participantSummary(conversation) }}</p>
                  @if (conversation.lastMessageAt) {
                    <p class="mt-1 text-xs font-bold text-slate-500">{{ conversation.lastMessageAt | date:'MMM d, h:mm a' }}</p>
                  }
                </button>
              }
            }
          </div>
        </aside>

        <article class="grid min-h-[34rem] grid-rows-[auto_1fr_auto]">
          @if (selectedThread(); as thread) {
            <header class="border-b border-slate-200 px-4 py-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ channelLabel(thread.conversation.channelType) }}</p>
                  <h2 class="mt-0.5 text-xl font-black text-slate-950">{{ thread.conversation.title }}</h2>
                  <p class="mt-1 text-xs font-semibold text-slate-500">{{ participantSummary(thread.conversation) }}</p>
                </div>
                @if (thread.conversation.workOrderNumber) {
                  <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{{ thread.conversation.workOrderNumber }}</span>
                }
              </div>
            </header>

            <div class="space-y-2 overflow-y-auto bg-slate-50 p-3">
              @if (threadLoading()) {
                <div class="grid min-h-60 place-items-center text-sm font-bold text-slate-500">
                  <i class="pi pi-spin pi-spinner mr-2"></i>
                  Opening thread...
                </div>
              } @else {
                @for (message of thread.messages; track message.id) {
                  <div class="flex" [class.justify-end]="message.mine">
                    <div class="max-w-[78%] rounded-lg border px-3 py-2 shadow-sm" [class.bg-teal-700]="message.mine" [class.text-white]="message.mine" [class.bg-white]="!message.mine" [class.text-slate-900]="!message.mine" [class.border-teal-700]="message.mine" [class.border-slate-200]="!message.mine">
                      <div class="mb-1 flex flex-wrap items-center gap-2 text-xs font-bold" [class.text-teal-50]="message.mine" [class.text-slate-500]="!message.mine">
                        <span>{{ message.senderName }}</span>
                        <span>{{ message.senderRole }}</span>
                        <span>{{ message.createdAt | date:'MMM d, h:mm a' }}</span>
                      </div>
                      <p class="whitespace-pre-wrap text-sm font-semibold leading-relaxed">{{ message.body }}</p>
                    </div>
                  </div>
                }
              }
            </div>

            <footer class="border-t border-slate-200 bg-white p-3">
              <div class="grid gap-2 md:grid-cols-[1fr_auto]">
                <textarea class="min-h-20 rounded-lg border border-slate-300 p-3 text-sm font-semibold" placeholder="Write a message..." [ngModel]="draft()" (ngModelChange)="draft.set($event)" (keydown.meta.enter)="send()" (keydown.control.enter)="send()"></textarea>
                <button pButton type="button" icon="pi pi-send" label="Send" class="self-end" [disabled]="!draft().trim()" [loading]="sending()" (click)="send()"></button>
              </div>
            </footer>
          } @else {
            <div class="grid place-items-center bg-slate-50 p-6 text-center">
              <div class="max-w-md">
                <span class="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-teal-50 text-teal-700"><i class="pi pi-comments text-xl"></i></span>
                <h2 class="mt-4 text-2xl font-black text-slate-950">Select a conversation</h2>
                <p class="mt-2 text-sm font-semibold text-slate-600">Pick a thread on the left, or start a message to a worker, operations group, or announcement audience.</p>
              </div>
            </div>
          }
        </article>
      </div>
    </section>
  `
})
export class MessagesPageComponent implements OnDestroy {
  private readonly communicationService = inject(CommunicationService);
  private readonly tenantUserService = inject(TenantUserService);
  private readonly route = inject(ActivatedRoute);
  protected readonly filterOptions: ChannelOption[] = [
    { value: 'ALL', label: 'All', helper: 'Every conversation', icon: 'pi pi-inbox' },
    { value: 'WORK_ORDER', label: 'Work orders', helper: 'Chats tied to jobs', icon: 'pi pi-briefcase' },
    { value: 'WORKER_OPERATIONS', label: 'Ops chat', helper: 'Worker and dispatch', icon: 'pi pi-users' },
    { value: 'ANNOUNCEMENT', label: 'Announcements', helper: 'Broadcast updates', icon: 'pi pi-megaphone' },
    { value: 'WORKER_DIRECT', label: 'Worker chats', helper: 'Worker-to-worker', icon: 'pi pi-comments' }
  ];
  protected readonly createOptions: Array<ChannelOption & { value: CommunicationChannelType }> = [
    { value: 'WORKER_OPERATIONS', label: 'Message worker from operations', helper: 'Use for dispatch questions, route changes, supplies, or job help.', icon: 'pi pi-users' },
    { value: 'ANNOUNCEMENT', label: 'Send announcement', helper: 'Use for schedule updates, weather notices, or company-wide notes.', icon: 'pi pi-megaphone' },
    { value: 'WORKER_DIRECT', label: 'Private worker chat', helper: 'Use for one-to-one communication with a single worker.', icon: 'pi pi-comments' }
  ];
  protected readonly conversations = signal<ConversationRecord[]>([]);
  protected readonly users = signal<TenantUserRecord[]>([]);
  protected readonly selectedThread = signal<ConversationThread | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly threadLoading = signal(false);
  protected readonly sending = signal(false);
  protected readonly creating = signal(false);
  protected readonly error = signal('');
  protected readonly draft = signal('');
  protected readonly showCreate = signal(false);
  protected readonly newChannel = signal<CommunicationChannelType>('WORKER_OPERATIONS');
  protected readonly newTitle = signal('');
  protected readonly newMessage = signal('');
  protected readonly recipientSearch = signal('');
  protected readonly selectedUserIds = signal<string[]>([]);
  protected readonly filter = signal<CommunicationChannelType | 'ALL'>('ALL');
  protected readonly recipientOptions = computed(() => this.filteredRecipients());
  protected readonly selectedConversation = computed(() => this.conversations().find((conversation) => conversation.id === this.selectedId()));
  private readonly refreshTimer = window.setInterval(() => void this.refreshSilently(), 12000);

  constructor() {
    void this.load();
    void this.loadUsers().then(() => this.applyCreateFromRoute());
  }

  ngOnDestroy(): void {
    window.clearInterval(this.refreshTimer);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const conversations = await firstValueFrom(this.communicationService.list({ channelType: this.filter() }));
      this.conversations.set(conversations);
      const selected = this.selectedId();
      if (selected && !conversations.some((conversation) => conversation.id === selected)) {
        this.selectedId.set(null);
        this.selectedThread.set(null);
      }
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to load messages right now.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async setFilter(channelType: CommunicationChannelType | 'ALL'): Promise<void> {
    this.filter.set(channelType);
    await this.load();
  }

  protected toggleCreate(): void {
    this.showCreate.set(!this.showCreate());
    if (this.showCreate() && this.users().length === 0) {
      void this.loadUsers();
    }
  }

  protected onCreateVisible(visible: boolean): void {
    this.showCreate.set(visible);
  }

  protected setNewChannel(channelType: CommunicationChannelType): void {
    this.newChannel.set(channelType);
    this.selectedUserIds.set([]);
    this.recipientSearch.set('');
  }

  protected async select(conversation: ConversationRecord): Promise<void> {
    this.selectedId.set(conversation.id);
    this.threadLoading.set(true);
    this.error.set('');
    try {
      const thread = await firstValueFrom(this.communicationService.thread(conversation.id));
      this.selectedThread.set(thread);
      await firstValueFrom(this.communicationService.markRead(conversation.id));
      await this.load();
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to open that conversation.'));
    } finally {
      this.threadLoading.set(false);
    }
  }

  protected async send(): Promise<void> {
    const body = this.draft().trim();
    const conversationId = this.selectedId();
    if (!body || !conversationId) {
      return;
    }
    this.sending.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.communicationService.send(conversationId, body));
      this.draft.set('');
      const thread = await firstValueFrom(this.communicationService.thread(conversationId));
      this.selectedThread.set(thread);
      await this.load();
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to send this message.'));
    } finally {
      this.sending.set(false);
    }
  }

  private async refreshSilently(): Promise<void> {
    if (this.loading() || this.threadLoading() || this.sending() || this.creating()) {
      return;
    }
    try {
      const conversations = await firstValueFrom(this.communicationService.list({ channelType: this.filter() }));
      this.conversations.set(conversations);
      const conversationId = this.selectedId();
      if (conversationId && conversations.some((conversation) => conversation.id === conversationId)) {
        this.selectedThread.set(await firstValueFrom(this.communicationService.thread(conversationId)));
      }
    } catch {
      // Keep the current conversation visible; the next manual refresh will surface any error.
    }
  }

  protected async create(): Promise<void> {
    this.creating.set(true);
    this.error.set('');
    try {
      const thread = await firstValueFrom(this.communicationService.create({
        channelType: this.newChannel(),
        participantUserIds: this.selectedUserIds(),
        title: this.newTitle().trim() || undefined,
        initialMessage: this.newMessage().trim() || undefined
      }));
      this.selectedId.set(thread.conversation.id);
      this.selectedThread.set(thread);
      this.showCreate.set(false);
      this.newTitle.set('');
      this.newMessage.set('');
      this.selectedUserIds.set([]);
      this.recipientSearch.set('');
      await this.load();
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to create this conversation.'));
    } finally {
      this.creating.set(false);
    }
  }

  protected channelLabel(channelType: CommunicationChannelType): string {
    return this.filterOptions.find((option) => option.value === channelType)?.label || channelType;
  }

  protected participantSummary(conversation: ConversationRecord): string {
    return conversation.participants.map((participant) => participant.displayName || participant.email).slice(0, 4).join(', ') || 'No participants yet';
  }

  protected filterLabel(channelType: CommunicationChannelType | 'ALL'): string {
    return this.filterOptions.find((option) => option.value === channelType)?.label || 'Messages';
  }

  protected emptyStateHelp(channelType: CommunicationChannelType | 'ALL'): string {
    if (channelType === 'WORK_ORDER') {
      return 'Work-order chats are usually opened from a work-order review.';
    }
    if (channelType === 'WORKER_OPERATIONS') {
      return 'Start a message to a worker when dispatch needs a clear audited thread.';
    }
    if (channelType === 'ANNOUNCEMENT') {
      return 'Create an announcement for schedule or operational updates.';
    }
    if (channelType === 'WORKER_DIRECT') {
      return 'Worker handoff chats will show here.';
    }
    return 'Start a message from the button above.';
  }

  protected isRecipientSelected(userId: string): boolean {
    return this.selectedUserIds().includes(userId);
  }

  protected toggleRecipient(userId: string): void {
    if (this.newChannel() === 'WORKER_DIRECT') {
      this.selectedUserIds.set(this.selectedUserIds().includes(userId) ? [] : [userId]);
      return;
    }
    this.selectedUserIds.update((selected) => selected.includes(userId)
      ? selected.filter((candidate) => candidate !== userId)
      : [...selected, userId]);
  }

  protected selectAllWorkers(): void {
    this.addRecipients(this.users()
      .filter((user) => user.status === 'ACTIVE' && user.roles.includes('FIELD_WORKER'))
      .map((user) => user.id));
  }

  protected selectAllOperations(): void {
    this.addRecipients(this.users()
      .filter((user) => user.status === 'ACTIVE' && (user.roles.includes('TENANT_ADMIN') || user.roles.includes('OPERATIONS')))
      .map((user) => user.id));
  }

  protected roleSummary(user: TenantUserRecord): string {
    return user.roles.map((role) => role.replace(/_/g, ' ').toLowerCase()).join(', ') || 'user';
  }

  protected recipientHint(): string {
    if (this.newChannel() === 'ANNOUNCEMENT') {
      return 'Choose workers/admins who should receive the broadcast.';
    }
    if (this.newChannel() === 'WORKER_DIRECT') {
      return 'Choose one worker. This thread is visible only to selected participants.';
    }
    return 'Choose worker(s) and operations/admin users for this conversation.';
  }

  protected canCreate(): boolean {
    return this.newTitle().trim().length > 0 && this.newMessage().trim().length > 0 && this.selectedUserIds().length > 0;
  }

  private async loadUsers(): Promise<void> {
    try {
      this.users.set(await firstValueFrom(this.tenantUserService.list()));
    } catch {
      this.users.set([]);
    }
  }

  private filteredRecipients(): TenantUserRecord[] {
    const query = this.recipientSearch().trim().toLowerCase();
    const channelType = this.newChannel();
    return this.users()
      .filter((user) => user.status === 'ACTIVE')
      .filter((user) => {
        if (channelType === 'WORKER_DIRECT') {
          return user.roles.includes('FIELD_WORKER');
        }
        if (channelType === 'WORKER_OPERATIONS') {
          return user.roles.includes('FIELD_WORKER') || user.roles.includes('OPERATIONS') || user.roles.includes('TENANT_ADMIN');
        }
        return true;
      })
      .filter((user) => {
        if (!query) {
          return true;
        }
        return `${user.displayName} ${user.email} ${user.roles.join(' ')}`.toLowerCase().includes(query);
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  private addRecipients(userIds: string[]): void {
    this.selectedUserIds.update((selected) => Array.from(new Set([...selected, ...userIds])));
  }

  private applyCreateFromRoute(): void {
    const workerEmail = this.route.snapshot.queryParamMap.get('directWorkerEmail');
    const workerName = this.route.snapshot.queryParamMap.get('directWorkerName');
    if (!workerEmail) {
      return;
    }
    const workerUser = this.users().find((user) => user.email.toLowerCase() === workerEmail.toLowerCase());
    if (!workerUser) {
      this.error.set('Worker app login was not found for this email. Create the worker app login first.');
      return;
    }
    this.newChannel.set('WORKER_DIRECT');
    this.newTitle.set(`Direct chat with ${workerName || workerUser.displayName}`);
    this.selectedUserIds.set([workerUser.id]);
    this.recipientSearch.set(workerName || workerUser.displayName);
    this.showCreate.set(true);
  }

  private errorMessage(error: unknown, fallback: string): string {
    const maybeError = error as { error?: { error?: { message?: string }; message?: string } };
    return maybeError?.error?.error?.message || maybeError?.error?.message || fallback;
  }
}
