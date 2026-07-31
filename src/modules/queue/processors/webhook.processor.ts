import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createLogger } from '../../../common/services/logger.service';
import { QUEUE_NAMES } from '../queue-names';
import { WebhookJobData } from '../../webhook/webhook.service';
import { Webhook } from '../../webhook/entities/webhook.entity';
import { WebhookDelivery } from '../../webhook/entities/webhook-delivery.entity';
import { HookManager } from '../../../core/hooks';

export interface WebhookJobResult {
  statusCode: number;
  success: boolean;
  error?: string;
  responseTime: number;
}

@Processor(QUEUE_NAMES.WEBHOOK)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = createLogger('WebhookProcessor');

  constructor(
    @InjectRepository(Webhook, 'data')
    private readonly webhookRepository: Repository<Webhook>,
    @InjectRepository(WebhookDelivery, 'data')
    private readonly webhookDeliveryRepository: Repository<WebhookDelivery>,
    private readonly hookManager: HookManager,
  ) {
    super();
  }

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
      // Never let delivery-history persistence break the actual webhook delivery flow.
      this.logger.error(`Failed to persist webhook delivery record`, String(persistError), {
        webhookId: params.webhookId,
        deliveryId: params.deliveryId,
        action: 'webhook_delivery_record_failed',
      });
    }
  }

  async process(job: Job<WebhookJobData>): Promise<WebhookJobResult> {
    const { webhookId, url, event, payload, headers, maxRetries } = job.data;
    const startTime = Date.now();
    const sessionId = payload.sessionId;

    this.logger.log(`Processing webhook job ${job.id}`, {
      webhookId,
      event,
      deliveryId: payload.deliveryId,
      idempotencyKey: payload.idempotencyKey,
      attempt: job.attemptsMade + 1,
      action: 'webhook_process_start',
    });

    // Update retry count in headers
    const requestHeaders = {
      ...headers,
      'X-Wirebot-Retry-Count': String(job.attemptsMade),
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const responseTime = Date.now() - startTime;
      const success = response.ok;
      const responseBodyText = typeof response.text === 'function' ? await response.text().catch(() => '') : '';

      if (!success) {
        await this.recordDelivery({
          webhookId,
          deliveryId: payload.deliveryId,
          event,
          attempt: job.attemptsMade + 1,
          statusCode: response.status,
          success: false,
          durationMs: responseTime,
          requestPayload: payload,
          requestHeaders,
          responsePayload: responseBodyText,
          error: `HTTP ${response.status}: ${response.statusText}`,
        });
        const httpError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        (httpError as Error & { _deliveryRecorded?: boolean })._deliveryRecorded = true;
        throw httpError;
      }

      await this.recordDelivery({
        webhookId,
        deliveryId: payload.deliveryId,
        event,
        attempt: job.attemptsMade + 1,
        statusCode: response.status,
        success: true,
        durationMs: responseTime,
        requestPayload: payload,
        requestHeaders,
        responsePayload: responseBodyText,
      });

      // Update lastTriggeredAt on successful delivery
      await this.webhookRepository.update(webhookId, {
        lastTriggeredAt: new Date(),
      });

      // Execute hook after successful delivery
      await this.hookManager.execute(
        'webhook:delivered',
        {
          sessionId,
          event,
          webhookId,
          deliveryId: payload.deliveryId,
          statusCode: response.status,
          responseTime,
          attempt: job.attemptsMade + 1,
        },
        { sessionId, source: 'WebhookProcessor' },
      );

      this.logger.log(`Webhook delivered successfully`, {
        webhookId,
        event,
        deliveryId: payload.deliveryId,
        idempotencyKey: payload.idempotencyKey,
        statusCode: response.status,
        responseTime,
        attempt: job.attemptsMade + 1,
        action: 'webhook_delivered',
      });

      return {
        statusCode: response.status,
        success: true,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isFinalAttempt = job.attemptsMade + 1 >= maxRetries;
      const alreadyRecorded = error instanceof Error && (error as Error & { _deliveryRecorded?: boolean })._deliveryRecorded;

      if (!alreadyRecorded) {
        // Network error / timeout — no HTTP response was received
        await this.recordDelivery({
          webhookId,
          deliveryId: payload.deliveryId,
          event,
          attempt: job.attemptsMade + 1,
          statusCode: null,
          success: false,
          durationMs: responseTime,
          requestPayload: payload,
          requestHeaders,
          responsePayload: null,
          error: errorMessage,
        });
      }

      this.logger.error(`Webhook delivery failed`, errorMessage, {
        webhookId,
        event,
        deliveryId: payload.deliveryId,
        idempotencyKey: payload.idempotencyKey,
        responseTime,
        attempt: job.attemptsMade + 1,
        maxRetries,
        isFinalAttempt,
        action: 'webhook_failed',
      });

      // Execute error hook only on final failure (all retries exhausted)
      if (isFinalAttempt) {
        await this.hookManager.execute(
          'webhook:error',
          {
            sessionId,
            event,
            webhookId,
            deliveryId: payload.deliveryId,
            error: errorMessage,
            attempt: job.attemptsMade + 1,
          },
          { sessionId, source: 'WebhookProcessor' },
        );
      }

      // Re-throw to trigger BullMQ retry
      throw error;
    }
  }
}
