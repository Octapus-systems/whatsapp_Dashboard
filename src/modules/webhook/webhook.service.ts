import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { Webhook } from './entities/webhook.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { CreateWebhookDto, UpdateWebhookDto } from './dto';
import { createLogger } from '../../common/services/logger.service';
import { QUEUE_NAMES } from '../queue/queue-names';
import { generateIdempotencyKey, generateDeliveryId } from './utils/idempotency.util';
import { HookManager } from '../../core/hooks';

export interface WebhookPayload {
  event: string;
  timestamp: string;
  sessionId: string;
  idempotencyKey: string;
  deliveryId: string;
  data: Record<string, unknown>;
}

export interface WebhookJobData {
  webhookId: string;
  url: string;
  event: string;
  payload: WebhookPayload;
  signature: string;
  headers: Record<string, string>;
  attempt: number;
  maxRetries: number;
}

@Injectable()
export class WebhookService {
  private readonly logger = createLogger('WebhookService');
  private readonly queueEnabled: boolean;

  constructor(
    @InjectRepository(Webhook, 'data')
    private readonly webhookRepository: Repository<Webhook>,
    @InjectRepository(WebhookDelivery, 'data')
    private readonly webhookDeliveryRepository: Repository<WebhookDelivery>,
    private readonly configService: ConfigService,
    private readonly hookManager: HookManager,
    @Optional()
    @InjectQueue(QUEUE_NAMES.WEBHOOK)
    private readonly webhookQueue?: Queue<WebhookJobData>,
  ) {
    this.queueEnabled = configService.get<boolean>('queue.enabled', false);
  }

  async create(sessionId: string, dto: CreateWebhookDto): Promise<Webhook> {
    const webhook = this.webhookRepository.create({
      sessionId,
      url: dto.url,
      events: dto.events || ['message.received'],
      secret: dto.secret || null,
      headers: dto.headers || {},
      retryCount: dto.retryCount ?? 3,
    });

    return this.webhookRepository.save(webhook);
  }

  async findBySession(sessionId: string): Promise<Webhook[]> {
    return this.webhookRepository.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Webhook[]> {
    return this.webhookRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Webhook> {
    const webhook = await this.webhookRepository.findOne({ where: { id } });
    if (!webhook) {
      throw new NotFoundException(`Webhook with id '${id}' not found`);
    }
    return webhook;
  }

  async update(id: string, dto: UpdateWebhookDto): Promise<Webhook> {
    const webhook = await this.findOne(id);

    if (dto.url !== undefined) webhook.url = dto.url;
    if (dto.events !== undefined) webhook.events = dto.events;
    if (dto.secret !== undefined) webhook.secret = dto.secret;
    if (dto.headers !== undefined) webhook.headers = dto.headers;
    if (dto.active !== undefined) webhook.active = dto.active;
    if (dto.retryCount !== undefined) webhook.retryCount = dto.retryCount;

    return this.webhookRepository.save(webhook);
  }

  async delete(id: string): Promise<void> {
    const webhook = await this.findOne(id);
    await this.webhookRepository.remove(webhook);
  }

  async test(sessionId: string, webhookId: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const webhook = await this.findOne(webhookId);

    const testPayload: WebhookPayload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      sessionId,
      idempotencyKey: generateIdempotencyKey('test', { webhookId: webhook.id }),
      deliveryId: generateDeliveryId(),
      data: {
        message: 'This is a test webhook from Wirebot',
        webhookId: webhook.id,
        url: webhook.url,
      },
    };

    const body = JSON.stringify(testPayload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Wirebot-Webhook/1.0.0',
      'X-Wirebot-Event': 'test',
      'X-Wirebot-Idempotency-Key': testPayload.idempotencyKey,
      'X-Wirebot-Delivery-Id': testPayload.deliveryId,
      'X-Wirebot-Retry-Count': '0',
      ...webhook.headers,
    };

    if (webhook.secret) {
      headers['X-Wirebot-Signature'] = this.generateSignature(body, webhook.secret);
    }

    const startTime = Date.now();
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });
      const durationMs = Date.now() - startTime;
      const responseBodyText = await this.safeReadText(response);

      await this.recordDelivery({
        webhookId: webhook.id,
        deliveryId: testPayload.deliveryId,
        event: 'test',
        attempt: 1,
        statusCode: response.status,
        success: response.ok,
        durationMs,
        requestPayload: testPayload,
        requestHeaders: headers,
        responsePayload: responseBodyText,
        error: response.ok ? null : `HTTP ${response.status}: ${response.statusText}`,
      });

      return {
        success: response.ok,
        statusCode: response.status,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.recordDelivery({
        webhookId: webhook.id,
        deliveryId: testPayload.deliveryId,
        event: 'test',
        attempt: 1,
        statusCode: null,
        success: false,
        durationMs,
        requestPayload: testPayload,
        requestHeaders: headers,
        responsePayload: null,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Persist a single delivery attempt row. Failures to persist are logged but
   * never thrown — delivery-history bookkeeping must not affect the actual
   * webhook delivery flow.
   */
  private async recordDelivery(params: {
    webhookId: string;
    deliveryId: string;
    event: string;
    attempt: number;
    statusCode: number | null;
    success: boolean;
    durationMs: number;
    requestPayload: unknown;
    requestHeaders: Record<string, string>;
    responsePayload?: unknown;
    error?: string | null;
  }): Promise<void> {
    try {
      await this.webhookDeliveryRepository.save(
        this.webhookDeliveryRepository.create({
          webhookId: params.webhookId,
          deliveryId: params.deliveryId,
          event: params.event,
          attempt: params.attempt,
          statusCode: params.statusCode,
          success: params.success,
          durationMs: params.durationMs,
          requestPayload: params.requestPayload as Record<string, unknown>,
          requestHeaders: params.requestHeaders,
          responsePayload: (params.responsePayload as Record<string, unknown> | string) ?? null,
          error: params.error ?? null,
        }),
      );
    } catch (persistError) {
      this.logger.error(`Failed to persist webhook delivery record`, String(persistError), {
        webhookId: params.webhookId,
        deliveryId: params.deliveryId,
        action: 'webhook_delivery_record_failed',
      });
    }
  }

  /**
   * List past delivery attempts for a webhook, most recent first.
   */
  async getDeliveries(
    webhookId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: WebhookDelivery[]; total: number; page: number; limit: number }> {
    await this.findOne(webhookId); // 404s if webhook doesn't exist

    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);

    const [items, total] = await this.webhookDeliveryRepository.findAndCount({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return { items, total, page: safePage, limit: safeLimit };
  }

  /**
   * Get full details (including request/response payloads) for a single delivery attempt.
   */
  async getDelivery(webhookId: string, deliveryRowId: string): Promise<WebhookDelivery> {
    await this.findOne(webhookId); // 404s if webhook doesn't exist

    const delivery = await this.webhookDeliveryRepository.findOne({
      where: { id: deliveryRowId, webhookId },
    });

    if (!delivery) {
      throw new NotFoundException(`Webhook delivery with id '${deliveryRowId}' not found`);
    }

    return delivery;
  }

  async dispatch(sessionId: string, event: string, data: Record<string, unknown>): Promise<void> {
    const webhooks = await this.webhookRepository.find({
      where: { sessionId, active: true },
    });

    const matchingWebhooks = webhooks.filter(w => w.events.includes(event) || w.events.includes('*'));

    // Generate idempotency key (same for all webhooks receiving this event)
    const idempotencyKey = generateIdempotencyKey(event, { ...data, sessionId });

    // Dispatch to all matching webhooks
    for (const webhook of matchingWebhooks) {
      // Generate unique delivery ID for each webhook
      const deliveryId = generateDeliveryId();

      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        sessionId,
        idempotencyKey,
        deliveryId,
        data,
      };

      // Execute hook before webhook dispatch - plugins can modify payload
      const { continue: shouldContinue, data: hookResult } = await this.hookManager.execute(
        'webhook:before',
        { sessionId, event, payload },
        { sessionId, source: 'WebhookService' },
      );

      if (!shouldContinue) {
        this.logger.debug(`Webhook dispatch cancelled by plugin for ${event}`, {
          webhookId: webhook.id,
          action: 'webhook_cancelled_by_plugin',
        });
        continue;
      }

      // Use potentially modified payload
      const finalPayload = (hookResult as { payload: WebhookPayload }).payload;

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Wirebot-Webhook/1.0.0',
        'X-Wirebot-Event': event,
        'X-Wirebot-Idempotency-Key': idempotencyKey,
        'X-Wirebot-Delivery-Id': deliveryId,
        'X-Wirebot-Retry-Count': '0',
        ...webhook.headers,
      };

      // Use queue if available, otherwise fallback to direct delivery
      if (this.queueEnabled && this.webhookQueue) {
        const signature = webhook.secret ? this.generateSignature(JSON.stringify(finalPayload), webhook.secret) : '';

        if (webhook.secret) {
          headers['X-Wirebot-Signature'] = signature;
        }

        const jobData: WebhookJobData = {
          webhookId: webhook.id,
          url: webhook.url,
          event,
          payload: finalPayload,
          signature,
          headers,
          attempt: 1,
          maxRetries: webhook.retryCount,
        };

        try {
          await this.webhookQueue.add(`webhook-${webhook.id}`, jobData, {
            attempts: webhook.retryCount,
            backoff: {
              type: 'exponential',
              delay: this.configService.get<number>('webhook.retryDelay', 5000),
            },
          });

          // Execute hook after successful queue (NOT delivery - that happens in processor)
          await this.hookManager.execute(
            'webhook:queued',
            { sessionId, event, webhookId: webhook.id, deliveryId },
            { sessionId, source: 'WebhookService' },
          );

          this.logger.debug(`Webhook job queued for ${webhook.id}`, {
            webhookId: webhook.id,
            event,
            idempotencyKey,
            deliveryId,
            action: 'webhook_queued',
          });
        } catch (error) {
          // Execute hook on queue error (not delivery error - that happens in processor)
          await this.hookManager.execute(
            'webhook:error',
            { sessionId, event, webhookId: webhook.id, error: `Queue failed: ${String(error)}` },
            { sessionId, source: 'WebhookService' },
          );

          this.logger.error(`Failed to queue webhook ${webhook.id}`, String(error), {
            webhookId: webhook.id,
            action: 'webhook_queue_failed',
          });
        }
      } else {
        // Direct delivery when queue is disabled
        try {
          await this.deliverWebhook(webhook, finalPayload, headers);

          // Execute hook after successful delivery
          await this.hookManager.execute(
            'webhook:delivered',
            { sessionId, event, webhookId: webhook.id, deliveryId },
            { sessionId, source: 'WebhookService' },
          );

          // Legacy hook for backward compatibility
          await this.hookManager.execute(
            'webhook:after',
            { sessionId, event, webhookId: webhook.id, success: true },
            { sessionId, source: 'WebhookService' },
          );
        } catch (error) {
          // Execute hook on error
          await this.hookManager.execute(
            'webhook:error',
            { sessionId, event, webhookId: webhook.id, error: String(error) },
            { sessionId, source: 'WebhookService' },
          );

          this.logger.error(`Failed to deliver webhook ${webhook.id}`, String(error), {
            webhookId: webhook.id,
            action: 'webhook_delivery_failed',
          });
        }
      }
    }
  }

  /**
   * @deprecated Use job queue dispatch instead. This is kept for fallback.
   */
  private async deliverWebhook(
    webhook: Webhook,
    payload: WebhookPayload,
    headers: Record<string, string>,
    attempt = 1,
  ): Promise<void> {
    const body = JSON.stringify(payload);

    // Update retry count header
    headers['X-Wirebot-Retry-Count'] = String(attempt - 1);

    // Add signature if secret is configured and not already present
    if (webhook.secret && !headers['X-Wirebot-Signature']) {
      headers['X-Wirebot-Signature'] = this.generateSignature(body, webhook.secret);
    }

    const startTime = Date.now();
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(this.configService.get<number>('webhook.timeout', 10000)),
      });
      const durationMs = Date.now() - startTime;
      const responseBodyText = await this.safeReadText(response);

      if (!response.ok) {
        await this.recordDelivery({
          webhookId: webhook.id,
          deliveryId: payload.deliveryId,
          event: payload.event,
          attempt,
          statusCode: response.status,
          success: false,
          durationMs,
          requestPayload: payload,
          requestHeaders: headers,
          responsePayload: responseBodyText,
          error: `HTTP ${response.status}: ${response.statusText}`,
        });
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      await this.recordDelivery({
        webhookId: webhook.id,
        deliveryId: payload.deliveryId,
        event: payload.event,
        attempt,
        statusCode: response.status,
        success: true,
        durationMs,
        requestPayload: payload,
        requestHeaders: headers,
        responsePayload: responseBodyText,
      });

      // Update last triggered timestamp
      await this.webhookRepository.update(webhook.id, {
        lastTriggeredAt: new Date(),
      });

      this.logger.debug(`Webhook delivered to ${webhook.id}`, {
        webhookId: webhook.id,
        deliveryId: payload.deliveryId,
        action: 'webhook_delivered',
      });
    } catch (error) {
      this.logger.error(`Webhook delivery failed for ${webhook.id}`, String(error), {
        webhookId: webhook.id,
        attempt,
        deliveryId: payload.deliveryId,
        action: 'webhook_delivery_failed',
      });

      if (attempt < webhook.retryCount) {
        const delay = this.configService.get<number>('webhook.retryDelay', 5000);
        await this.delay(delay * attempt);
        return this.deliverWebhook(webhook, payload, headers, attempt + 1);
      }

      if (!(error instanceof Error && error.message.startsWith('HTTP '))) {
        // Network error / timeout — no HTTP response was received, and it wasn't
        // already recorded above (that branch only fires for non-ok HTTP responses).
        await this.recordDelivery({
          webhookId: webhook.id,
          deliveryId: payload.deliveryId,
          event: payload.event,
          attempt,
          statusCode: null,
          success: false,
          durationMs: Date.now() - startTime,
          requestPayload: payload,
          requestHeaders: headers,
          responsePayload: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      throw error;
    }
  }

  private generateSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Safely read a response body as text, tolerating responses that don't
   * implement `.text()` (e.g. minimal mocks in tests).
   */
  private async safeReadText(response: Response | { text?: () => Promise<string> }): Promise<string> {
    try {
      if (typeof response.text !== 'function') return '';
      return await response.text();
    } catch {
      return '';
    }
  }
}
