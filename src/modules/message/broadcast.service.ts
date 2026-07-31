import { Injectable, Logger, BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import type { Queue } from 'bullmq';
import {
  BroadcastJob,
  BroadcastStatus,
  BroadcastRecipientStatus,
  BroadcastProgress,
  BroadcastRecipientResult,
} from './entities/broadcast-job.entity';
import { CreateBroadcastDto } from './dto/broadcast.dto';
import { SessionService } from '../session/session.service';
import { MessageService } from './message.service';
import { QUEUE_NAMES } from '../queue/queue-names';

interface EngineContact {
  id: string;
  number?: string;
  isBlocked?: boolean;
}

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);
  // Tracks broadcasts currently running in-process (used only when the Bull queue is disabled),
  // mirroring the cancellation approach used by BulkMessageService.
  private readonly processingBroadcasts = new Map<string, boolean>();
  private readonly pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    @InjectRepository(BroadcastJob, 'data')
    private readonly broadcastRepository: Repository<BroadcastJob>,
    private readonly sessionService: SessionService,
    private readonly messageService: MessageService,
    @Optional() @InjectQueue(QUEUE_NAMES.BROADCAST) private readonly broadcastQueue?: Queue,
  ) {}

  async createBroadcast(sessionId: string, dto: CreateBroadcastDto): Promise<BroadcastJob> {
    const engine = this.sessionService.getEngine(sessionId);
    if (!engine) {
      throw new BadRequestException(`Session '${sessionId}' is not active`);
    }

    const recipients = await this.resolveRecipients(sessionId, dto);
    if (recipients.length === 0) {
      throw new BadRequestException('No recipients resolved for this broadcast');
    }

    const broadcastId = dto.broadcastId || `bcast_${randomUUID().split('-')[0]}`;
    const existing = await this.broadcastRepository.findOne({ where: { broadcastId } });
    if (existing) {
      throw new BadRequestException(`Broadcast ID '${broadcastId}' already exists`);
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduledAt date');
    }

    const delay = scheduledAt ? Math.max(0, scheduledAt.getTime() - Date.now()) : 0;

    const options = {
      delayBetweenMessages: dto.options?.delayBetweenMessages ?? 3000,
      randomizeDelay: dto.options?.randomizeDelay ?? true,
      stopOnError: dto.options?.stopOnError ?? false,
    };

    const progress: BroadcastProgress = {
      total: recipients.length,
      sent: 0,
      failed: 0,
      pending: recipients.length,
      cancelled: 0,
    };

    const broadcast = this.broadcastRepository.create({
      broadcastId,
      sessionId,
      message: dto.message,
      recipients,
      status: scheduledAt && delay > 0 ? BroadcastStatus.SCHEDULED : BroadcastStatus.PENDING,
      scheduledAt,
      options,
      progress,
      results: [],
      currentIndex: 0,
    });

    await this.broadcastRepository.save(broadcast);
    this.logger.log(`Created broadcast ${broadcastId} with ${recipients.length} recipients (delay=${delay}ms)`);

    if (this.broadcastQueue) {
      const job = await this.broadcastQueue.add(
        'send',
        { broadcastId: broadcast.broadcastId },
        { delay, jobId: broadcast.broadcastId, removeOnComplete: true, removeOnFail: false },
      );
      broadcast.bullJobId = job.id ?? null;
      await this.broadcastRepository.save(broadcast);
    } else {
      // No Bull/Redis available in this environment: fall back to in-process scheduling,
      // the same approach BulkMessageService uses for immediate sends.
      const run = () => {
        this.pendingTimers.delete(broadcast.id);
        this.processBroadcast(broadcast.broadcastId).catch(err => {
          this.logger.error(`Broadcast ${broadcastId} processing error: ${String(err)}`);
        });
      };
      if (delay > 0) {
        const timer = setTimeout(run, delay);
        this.pendingTimers.set(broadcast.id, timer);
      } else {
        run();
      }
    }

    return broadcast;
  }

  async listBroadcasts(sessionId: string): Promise<BroadcastJob[]> {
    return this.broadcastRepository.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });
  }

  async getBroadcastStatus(sessionId: string, broadcastId: string): Promise<BroadcastJob> {
    const broadcast = await this.broadcastRepository.findOne({ where: { broadcastId, sessionId } });
    if (!broadcast) {
      throw new NotFoundException(`Broadcast '${broadcastId}' not found`);
    }
    return broadcast;
  }

  async cancelBroadcast(sessionId: string, broadcastId: string): Promise<BroadcastJob> {
    const broadcast = await this.broadcastRepository.findOne({ where: { broadcastId, sessionId } });
    if (!broadcast) {
      throw new NotFoundException(`Broadcast '${broadcastId}' not found`);
    }

    if (broadcast.status === BroadcastStatus.COMPLETED || broadcast.status === BroadcastStatus.CANCELLED) {
      throw new BadRequestException(`Broadcast '${broadcastId}' is already ${broadcast.status}`);
    }

    // Remove a still-delayed Bull job, if any.
    if (this.broadcastQueue && broadcast.bullJobId) {
      const job = await this.broadcastQueue.getJob(broadcast.bullJobId);
      if (job) {
        const state = await job.getState();
        if (state === 'delayed' || state === 'waiting') {
          await job.remove();
        }
      }
    }

    // Signal cancellation for an in-flight in-process run.
    this.processingBroadcasts.set(broadcast.id, false);

    // Cancel a pending in-process timer (scheduled, not yet started).
    const timer = this.pendingTimers.get(broadcast.id);
    if (timer) {
      clearTimeout(timer);
      this.pendingTimers.delete(broadcast.id);
    }

    broadcast.status = BroadcastStatus.CANCELLED;
    broadcast.progress.cancelled = broadcast.progress.pending;
    broadcast.progress.pending = 0;
    broadcast.completedAt = new Date();

    await this.broadcastRepository.save(broadcast);
    this.logger.log(`Cancelled broadcast ${broadcastId}`);

    return broadcast;
  }

  /**
   * Sends the broadcast message to every recipient, one at a time, respecting the
   * same delay/rate-limiting options used by BulkMessageService. Invoked either by
   * the BullMQ processor (when the queue is enabled) or directly/in-process otherwise.
   */
  async processBroadcast(broadcastId: string): Promise<void> {
    const broadcast = await this.broadcastRepository.findOne({ where: { broadcastId } });
    if (!broadcast) return;
    if (broadcast.status === BroadcastStatus.CANCELLED) return;

    this.processingBroadcasts.set(broadcast.id, true);

    broadcast.status = BroadcastStatus.PROCESSING;
    broadcast.startedAt = new Date();
    await this.broadcastRepository.save(broadcast);

    const engine = this.sessionService.getEngine(broadcast.sessionId);
    if (!engine) {
      broadcast.status = BroadcastStatus.FAILED;
      broadcast.completedAt = new Date();
      await this.broadcastRepository.save(broadcast);
      this.processingBroadcasts.delete(broadcast.id);
      return;
    }

    const results: BroadcastRecipientResult[] = broadcast.results || [];

    for (let i = broadcast.currentIndex; i < broadcast.recipients.length; i++) {
      if (!this.processingBroadcasts.get(broadcast.id)) {
        this.logger.log(`Broadcast ${broadcast.broadcastId} cancelled at index ${i}`);
        break;
      }

      const chatId = broadcast.recipients[i];
      const result: BroadcastRecipientResult = {
        chatId,
        status: BroadcastRecipientStatus.PENDING,
      };

      try {
        const sendResult = await this.messageService.sendText(broadcast.sessionId, { chatId, text: broadcast.message });

        result.status = BroadcastRecipientStatus.SENT;
        result.messageId = sendResult.messageId;
        result.sentAt = new Date();
        broadcast.progress.sent++;
        broadcast.progress.pending--;

        this.logger.debug(
          `Broadcast ${broadcast.broadcastId}: sent ${i + 1}/${broadcast.recipients.length} to ${chatId}`,
        );
      } catch (error) {
        result.status = BroadcastRecipientStatus.FAILED;
        result.error = error instanceof Error ? error.message : String(error);
        broadcast.progress.failed++;
        broadcast.progress.pending--;

        this.logger.warn(`Broadcast ${broadcast.broadcastId}: failed to ${chatId}: ${result.error}`);

        if (broadcast.options.stopOnError) {
          results.push(result);
          broadcast.currentIndex = i + 1;
          broadcast.results = results;
          broadcast.status = BroadcastStatus.FAILED;
          broadcast.completedAt = new Date();
          await this.broadcastRepository.save(broadcast);
          this.processingBroadcasts.delete(broadcast.id);
          return;
        }
      }

      results.push(result);
      broadcast.currentIndex = i + 1;
      broadcast.results = results;

      if (i % 10 === 0 || i === broadcast.recipients.length - 1) {
        await this.broadcastRepository.save(broadcast);
      }

      if (i < broadcast.recipients.length - 1 && this.processingBroadcasts.get(broadcast.id)) {
        const delay = this.calculateDelay(broadcast.options);
        await this.sleep(delay);
      }
    }

    if (this.processingBroadcasts.get(broadcast.id)) {
      broadcast.status =
        broadcast.progress.failed > 0 && broadcast.progress.sent === 0 ? BroadcastStatus.FAILED : BroadcastStatus.COMPLETED;
    }
    broadcast.completedAt = new Date();
    broadcast.results = results;
    await this.broadcastRepository.save(broadcast);

    this.processingBroadcasts.delete(broadcast.id);
    this.logger.log(
      `Broadcast ${broadcast.broadcastId} completed: ${broadcast.progress.sent} sent, ${broadcast.progress.failed} failed`,
    );
  }

  private async resolveRecipients(sessionId: string, dto: CreateBroadcastDto): Promise<string[]> {
    let recipients: string[] = [];

    if (dto.allContacts) {
      const engine = this.sessionService.getEngine(sessionId);
      if (!engine) {
        throw new BadRequestException(`Session '${sessionId}' is not active`);
      }
      const contacts = (await engine.getContacts()) as EngineContact[];
      recipients = contacts.filter(c => !c.isBlocked).map(c => c.id);
    } else {
      recipients = dto.recipients || [];
    }

    // De-duplicate while preserving order.
    return Array.from(new Set(recipients.filter(Boolean)));
  }

  private calculateDelay(options: { delayBetweenMessages: number; randomizeDelay: boolean }): number {
    let delay = options.delayBetweenMessages;
    if (options.randomizeDelay) {
      delay += Math.random() * 2000;
    }
    return delay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
