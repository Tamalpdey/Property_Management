import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CommunicationChannelType, ConversationRecord, ConversationThread } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { WorkerCommunicationService } from './services/worker-communication.service';

interface WorkerConversationGroup {
  title: string;
  conversations: ConversationRecord[];
}

@Component({
  selector: 'lorne-worker-messages',
  standalone: true,
  imports: [ButtonModule, DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="grid gap-3">
      <header class="rounded-xl border border-slate-800 bg-slate-950 p-4 text-white shadow-lg shadow-slate-950/10">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-black uppercase tracking-wide text-teal-200">Messages</p>
            <h1 class="mt-1 text-2xl font-black tracking-tight">Talk to operations</h1>
            <p class="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-300">Ask dispatch questions, report blockers, and keep job conversations in the audit trail.</p>
          </div>
          <button pButton type="button" severity="secondary" icon="pi pi-refresh" [loading]="loading()" (click)="load()"></button>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button pButton type="button" icon="pi pi-comments" label="Operations chat" class="w-full sm:w-auto" [loading]="openingOps()" (click)="openOperations()"></button>
          <span class="rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-teal-100">Auto-refresh on</span>
        </div>
      </header>

      @if (error()) {
        <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{{ error() }}</div>
      }

      <div class="grid gap-3 lg:grid-cols-[22rem_1fr]">
        <aside class="rounded-xl border border-teal-100 bg-white p-2 shadow-sm">
          <div class="flex items-center justify-between gap-2 px-2 py-1">
            <h2 class="text-sm font-black uppercase tracking-wide text-teal-700">Threads</h2>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">{{ conversations().length }}</span>
          </div>
          <div class="mt-2 max-h-[28rem] overflow-y-auto">
            @if (loading()) {
              <div class="grid min-h-36 place-items-center text-sm font-bold text-slate-500">
                <i class="pi pi-spin pi-spinner mr-2"></i>
                Loading messages...
              </div>
            } @else if (conversations().length === 0) {
              <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                <p class="text-sm font-black text-slate-700">No messages yet.</p>
                <p class="mt-1 text-xs font-semibold text-slate-500">Tap Operations chat to start a thread with dispatch.</p>
              </div>
            } @else {
              @for (group of conversationGroups(); track group.title) {
                @if (group.conversations.length > 0) {
                  <p class="px-2 pb-1 pt-2 text-[0.7rem] font-black uppercase tracking-wide text-slate-400">{{ group.title }}</p>
                  @for (conversation of group.conversations; track conversation.id) {
                    <button
                      type="button"
                      class="mb-2 w-full rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-teal-200 hover:bg-teal-50"
                      [class.border-teal-400]="selectedId() === conversation.id"
                      [class.border-slate-200]="selectedId() !== conversation.id"
                      (click)="select(conversation)"
                    >
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                          <p class="truncate text-base font-black text-slate-950">{{ conversation.title }}</p>
                          <p class="mt-1 text-xs font-black uppercase tracking-wide text-teal-700">{{ channelLabel(conversation.channelType) }}</p>
                        </div>
                        @if (conversation.unreadCount > 0) {
                          <span class="rounded-full bg-teal-600 px-2 py-0.5 text-xs font-black text-white">{{ conversation.unreadCount }}</span>
                        }
                      </div>
                      <p class="mt-2 line-clamp-2 text-sm font-semibold text-slate-600">{{ conversation.lastMessagePreview || emptyPreview(conversation.channelType) }}</p>
                      @if (conversation.lastMessageAt) {
                        <p class="mt-2 text-xs font-bold text-slate-500">{{ conversation.lastMessageAt | date:'MMM d, h:mm a' }}</p>
                      }
                    </button>
                  }
                }
              }
            }
          </div>
        </aside>

        <article class="grid min-h-[31rem] overflow-hidden rounded-xl border border-teal-100 bg-white shadow-sm">
          @if (selectedThread(); as thread) {
            <div class="grid min-h-[31rem] grid-rows-[auto_1fr_auto]">
              <header class="border-b border-slate-200 px-4 py-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ channelLabel(thread.conversation.channelType) }}</p>
                    <h2 class="mt-1 text-xl font-black text-slate-950">{{ thread.conversation.title }}</h2>
                    <p class="mt-1 text-xs font-bold text-slate-500">{{ thread.conversation.participants.length }} participant(s)</p>
                  </div>
                  @if (thread.conversation.workOrderNumber) {
                    <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{{ thread.conversation.workOrderNumber }}</span>
                  }
                </div>
              </header>

              <div class="space-y-2 overflow-y-auto bg-slate-50 p-3">
                @if (threadLoading()) {
                  <div class="grid min-h-56 place-items-center text-sm font-bold text-slate-500">
                    <i class="pi pi-spin pi-spinner mr-2"></i>
                    Opening thread...
                  </div>
                } @else if (thread.messages.length === 0) {
                  <div class="grid min-h-56 place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center">
                    <div>
                      <span class="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-teal-50 text-teal-700"><i class="pi pi-comments text-xl"></i></span>
                      <p class="mt-3 text-base font-black text-slate-900">No messages in this thread yet.</p>
                      <p class="mt-1 text-sm font-semibold text-slate-500">Send the first update below.</p>
                    </div>
                  </div>
                } @else {
                  @for (message of thread.messages; track message.id) {
                    <div class="flex" [class.justify-end]="message.mine">
                      <div class="max-w-[86%] rounded-lg border px-3 py-2 shadow-sm" [class.bg-teal-700]="message.mine" [class.text-white]="message.mine" [class.bg-white]="!message.mine" [class.text-slate-900]="!message.mine" [class.border-teal-700]="message.mine" [class.border-slate-200]="!message.mine">
                        <div class="mb-1 flex flex-wrap items-center gap-2 text-xs font-bold" [class.text-teal-50]="message.mine" [class.text-slate-500]="!message.mine">
                          <span>{{ message.senderName }}</span>
                          <span>{{ message.createdAt | date:'MMM d, h:mm a' }}</span>
                        </div>
                        <p class="whitespace-pre-wrap text-sm font-semibold leading-relaxed">{{ message.body }}</p>
                      </div>
                    </div>
                  }
                }
              </div>

              <footer class="border-t border-slate-200 bg-white p-3">
                <textarea class="min-h-24 w-full rounded-lg border border-slate-300 p-3 text-base font-semibold" placeholder="Message operations..." [ngModel]="draft()" (ngModelChange)="draft.set($event)"></textarea>
                <button pButton type="button" icon="pi pi-send" label="Send message" class="mt-2 w-full" [disabled]="!draft().trim()" [loading]="sending()" (click)="send()"></button>
              </footer>
            </div>
          } @else {
            <div class="grid place-items-center p-6 text-center">
              <div class="max-w-sm">
                <span class="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-teal-50 text-teal-700"><i class="pi pi-comments text-2xl"></i></span>
                <h2 class="mt-4 text-2xl font-black text-slate-950">Open a thread</h2>
                <p class="mt-2 text-sm font-semibold text-slate-600">Operations chat is for help, supplies, directions, or reassignment. Work-order chats stay tied to the job.</p>
              </div>
            </div>
          }
        </article>
      </div>
    </section>
  `
})
export class WorkerMessagesComponent implements OnDestroy {
  private readonly communicationService = inject(WorkerCommunicationService);
  protected readonly conversations = signal<ConversationRecord[]>([]);
  protected readonly conversationGroups = computed<WorkerConversationGroup[]>(() => [
    {
      title: 'Operations',
      conversations: this.conversations().filter((conversation) => conversation.channelType === 'WORKER_OPERATIONS')
    },
    {
      title: 'Work orders',
      conversations: this.conversations().filter((conversation) => conversation.channelType === 'WORK_ORDER')
    },
    {
      title: 'Announcements',
      conversations: this.conversations().filter((conversation) => conversation.channelType === 'ANNOUNCEMENT')
    },
    {
      title: 'Worker chats',
      conversations: this.conversations().filter((conversation) => conversation.channelType === 'WORKER_DIRECT')
    }
  ]);
  protected readonly selectedThread = signal<ConversationThread | null>(null);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly threadLoading = signal(false);
  protected readonly sending = signal(false);
  protected readonly openingOps = signal(false);
  protected readonly error = signal('');
  protected readonly draft = signal('');
  private readonly refreshTimer = window.setInterval(() => void this.refreshSilently(), 12000);

  constructor() {
    void this.load(true);
  }

  ngOnDestroy(): void {
    window.clearInterval(this.refreshTimer);
  }

  protected async load(openDefaultThread = false): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const conversations = await firstValueFrom(this.communicationService.list());
      this.conversations.set(conversations);
      const selected = this.selectedId();
      if (selected && !conversations.some((conversation) => conversation.id === selected)) {
        this.selectedId.set(null);
        this.selectedThread.set(null);
      }
      if (openDefaultThread && !this.selectedId()) {
        const operationsThread = conversations.find((conversation) => conversation.channelType === 'WORKER_OPERATIONS');
        if (operationsThread) {
          await this.select(operationsThread);
        } else {
          await this.openOperations();
        }
      }
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to load messages right now.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async openOperations(): Promise<void> {
    this.openingOps.set(true);
    this.error.set('');
    try {
      const thread = await firstValueFrom(this.communicationService.openOperationsThread());
      this.selectedId.set(thread.conversation.id);
      this.selectedThread.set(thread);
      await this.load();
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to open operations chat.'));
    } finally {
      this.openingOps.set(false);
    }
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
      this.selectedThread.set(await firstValueFrom(this.communicationService.thread(conversationId)));
      await this.load();
    } catch (error) {
      this.error.set(this.errorMessage(error, 'Unable to send this message.'));
    } finally {
      this.sending.set(false);
    }
  }

  private async refreshSilently(): Promise<void> {
    if (this.loading() || this.threadLoading() || this.sending() || this.openingOps()) {
      return;
    }
    try {
      const conversations = await firstValueFrom(this.communicationService.list());
      this.conversations.set(conversations);
      const conversationId = this.selectedId();
      if (conversationId && conversations.some((conversation) => conversation.id === conversationId)) {
        this.selectedThread.set(await firstValueFrom(this.communicationService.thread(conversationId)));
      }
    } catch {
      // Keep the worker in their current thread; manual refresh can surface transient failures.
    }
  }

  protected channelLabel(channelType: CommunicationChannelType): string {
    switch (channelType) {
      case 'WORK_ORDER':
        return 'Work-order chat';
      case 'WORKER_OPERATIONS':
        return 'Operations chat';
      case 'WORKER_DIRECT':
        return 'Worker chat';
      case 'ANNOUNCEMENT':
        return 'Announcement';
    }
  }

  protected emptyPreview(channelType: CommunicationChannelType): string {
    if (channelType === 'WORK_ORDER') {
      return 'No job messages yet.';
    }
    if (channelType === 'ANNOUNCEMENT') {
      return 'No announcement text yet.';
    }
    return 'No messages yet.';
  }

  private errorMessage(error: unknown, fallback: string): string {
    const maybeError = error as { error?: { error?: { message?: string }; message?: string } };
    return maybeError?.error?.error?.message || maybeError?.error?.message || fallback;
  }
}
