import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Session, SessionStatus } from './entities/session.entity';
import { CreateSessionDto } from './dto';
import { EngineFactory } from '../../engine/engine.factory';
import { IWhatsAppEngine, EngineStatus } from '../../engine/interfaces/whatsapp-engine.interface';
import { createLogger } from '../../common/services/logger.service';
import { EventsGateway } from '../events/events.gateway';
import { WebhookService } from '../webhook/webhook.service';
import { HookManager } from '../../core/hooks';
import { MessageService } from '../message/message.service';

interface ReconnectState {
  attempts: number;
  timer: NodeJS.Timeout | null;
  maxAttempts: number;
  baseDelay: number;
}

@Injectable()
export class SessionService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = createLogger('SessionService');

  // In-memory map of active engine instances
  private engines: Map<string, IWhatsAppEngine> = new Map();

  // Reconnection state per session
  private reconnectStates: Map<string, ReconnectState> = new Map();

  constructor(
    @InjectRepository(Session, 'data')
    private readonly sessionRepository: Repository<Session>,
    @InjectDataSource('data')
    private readonly dataSource: DataSource,
    private readonly engineFactory: EngineFactory,
    private readonly eventsGateway: EventsGateway,
    private readonly webhookService: WebhookService,
    private readonly hookManager: HookManager,
    @Inject(forwardRef(() => MessageService))
    private readonly messageService: MessageService,
  ) {}

  /**
   * On backend startup, reset all active session statuses to disconnected
   * because the engines are not running yet after restart
   */
  async onModuleInit(): Promise<void> {
    const activeStatuses = [
      SessionStatus.READY,
      SessionStatus.INITIALIZING,
      SessionStatus.QR_READY,
      SessionStatus.AUTHENTICATING,
    ];

    const result = await this.sessionRepository.update(
      { status: In(activeStatuses) },
      { status: SessionStatus.DISCONNECTED },
    );

    if (result.affected && result.affected > 0) {
      this.logger.log(`Reset ${result.affected} session(s) to disconnected on startup`, {
        action: 'startup_reset',
        affected: result.affected,
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Clean up all engines on shutdown
    for (const [sessionId, engine] of this.engines) {
      this.logger.log(`Destroying engine for session ${sessionId}`, {
        sessionId,
        action: 'shutdown',
      });
      await engine.destroy();
    }
    this.engines.clear();

    // Clear all reconnect timers
    for (const [, state] of this.reconnectStates) {
      if (state.timer) {
        clearTimeout(state.timer);
      }
    }
    this.reconnectStates.clear();
  }

  async create(dto: CreateSessionDto): Promise<Session> {
    // Check if session with same name exists
    const existing = await this.sessionRepository.findOne({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`Session with name '${dto.name}' already exists`);
    }

    const session = this.sessionRepository.create({
      name: dto.name,
      config: dto.config || {},
      proxyUrl: dto.proxyUrl || null,
      proxyType: dto.proxyType || null,
      status: SessionStatus.CREATED,
    });

    const saved = await this.dataSource.transaction(async manager => {
      return await manager.save(session);
    });
    this.logger.log(`Session created: ${saved.name}`, {
      sessionId: saved.id,
      action: 'create',
    });

    // Execute hook after session created (outside transaction since hooks do external I/O)
    await this.hookManager.execute('session:created', saved, {
      sessionId: saved.id,
      source: 'SessionService',
    });

    return saved;
  }

  async findAll(): Promise<Session[]> {
    return this.sessionRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException(`Session with id '${id}' not found`);
    }
    return session;
  }

  async findByName(name: string): Promise<Session> {
    const session = await this.sessionRepository.findOne({ where: { name } });
    if (!session) {
      throw new NotFoundException(`Session with name '${name}' not found`);
    }
    return session;
  }

  async delete(id: string): Promise<void> {
    const session = await this.findOne(id);

    // Cancel any reconnection attempts
    this.cancelReconnect(id);

    // Stop engine if running
    const engine = this.engines.get(id);
    if (engine) {
      await engine.destroy();
      this.engines.delete(id);
    }

    // Execute hook BEFORE delete so plugins can access session data
    await this.hookManager.execute(
      'session:deleted',
      {
        id: session.id,
        name: session.name,
        phone: session.phone,
        pushName: session.pushName,
      },
      {
        sessionId: id,
        source: 'SessionService',
      },
    );

    await this.dataSource.transaction(async manager => {
      await manager.remove(session);
    });
    this.logger.log(`Session deleted: ${session.name}`, {
      sessionId: id,
      action: 'delete',
    });
  }

  async start(id: string): Promise<Session> {
    const session = await this.findOne(id);

    if (this.engines.has(id)) {
      throw new BadRequestException('Session is already started');
    }

    // Execute hook before starting
    await this.hookManager.execute(
      'session:starting',
      { sessionId: id },
      {
        sessionId: id,
        source: 'SessionService',
      },
    );

    // Initialize reconnect state
    const config = session.config as {
      maxReconnectAttempts?: number;
      reconnectBaseDelay?: number;
    } | null;
    this.reconnectStates.set(id, {
      attempts: 0,
      timer: null,
      maxAttempts: config?.maxReconnectAttempts ?? 5,
      baseDelay: config?.reconnectBaseDelay ?? 5000,
    });

    await this.initializeEngine(id, session);
    return this.findOne(id);
  }

  private async initializeEngine(id: string, session: Session): Promise<void> {
    this.logger.log(`Initializing engine for session: ${session.name}`, {
      sessionId: id,
      action: 'engine_init',
      proxyEnabled: !!session.proxyUrl,
    });

    const engine = this.engineFactory.create({
      sessionId: session.name,
      proxyUrl: session.proxyUrl || undefined,
      proxyType: session.proxyType || undefined,
    });
    this.engines.set(id, engine);

    await engine.initialize({
      onQRCode: (): void => {
        this.logger.log('QR code generated', {
          sessionId: id,
          action: 'qr_generated',
        });

        // Execute hook for QR event
        void this.hookManager.execute(
          'session:qr',
          { sessionId: id },
          {
            sessionId: id,
            source: 'Engine',
          },
        );

        void this.updateStatus(id, SessionStatus.QR_READY);
      },
      onReady: (phone: string, pushName: string): void => {
        this.logger.log(`Session ready: ${phone}`, {
          sessionId: id,
          phone,
          pushName,
          action: 'ready',
        });

        // Execute hook for ready event
        void this.hookManager.execute(
          'session:ready',
          { phone, pushName },
          {
            sessionId: id,
            source: 'Engine',
          },
        );

        // Reset reconnect attempts on successful connection
        const reconnectState = this.reconnectStates.get(id);
        if (reconnectState) {
          reconnectState.attempts = 0;
        }

        void this.sessionRepository.update(id, {
          status: SessionStatus.READY,
          phone,
          pushName,
          connectedAt: new Date(),
          lastActiveAt: new Date(),
        });
      },
      onMessage: (message): void => {
        this.logger.log(`📩 Incoming message from ${message.from} | type=${message.type} | id=${message.id}`, {
          sessionId: id,
          messageId: message.id,
          from: message.from,
          chatId: message.chatId,
          type: message.type,
          fromMe: message.fromMe,
          action: 'message_received',
        });

        // Update last active timestamp
        void this.sessionRepository.update(id, { lastActiveAt: new Date() });

        // Process message through hook pipeline and persist + emit — wrapped in async IIFE with full error handling
        void (async () => {
          try {
            const messageData = { ...message };

            // Execute hook for message received - plugins can modify or stop processing
            const { continue: shouldContinue, data: finalMessage } = await this.hookManager.execute(
              'message:received',
              messageData,
              { sessionId: id, source: 'Engine' },
            );

            if (!shouldContinue) {
              this.logger.debug('Message processing stopped by plugin hook', { sessionId: id, messageId: message.id });
              return;
            }

            const msg = finalMessage;

            // Build metadata: merge any existing metadata + media info
            const metadata: Record<string, unknown> = { ...(msg.metadata ?? {}) };
            if (msg.media) {
              metadata.media = msg.media;
            }

            // Persist incoming message to DB (non-blocking but errors are now logged)
            this.messageService
              .saveIncomingMessage(id, {
                waMessageId: msg.id,
                chatId: msg.chatId || msg.from,
                from: msg.from,
                // Ensure `to` is always a non-empty string (entity column is NOT NULL)
                to: msg.to || '',
                body: msg.body || '',
                type: msg.type || 'text',
                timestamp: msg.timestamp,
                metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
              })
              .then(() => {
                this.logger.debug(`✅ Incoming message persisted to DB`, { sessionId: id, waMessageId: msg.id });
              })
              .catch((dbErr: unknown) => {
                this.logger.error(
                  `❌ Failed to persist incoming message to DB`,
                  dbErr instanceof Error ? dbErr.message : String(dbErr),
                  { sessionId: id, waMessageId: msg.id, from: msg.from },
                );
              });

            // Dispatch to webhooks
            void this.webhookService.dispatch(id, 'message.received', finalMessage);

            // Emit real-time event to all WebSocket clients subscribed to this session
            // The payload includes direction so the frontend can render left/right correctly.
            // chatId is already resolved to canonical @c.us by the adapter LID normaliser;
            // we also surface the original `from` so the frontend can update its LID cache.
            const wsPayload: Record<string, unknown> = {
              ...(finalMessage as Record<string, unknown>),
              direction: 'incoming',
              sessionId: id,
              // Ensure the canonical chatId is always present at the top level
              chatId: msg.chatId || msg.from,
            };
            this.logger.debug(`📡 Emitting message.received via WebSocket`, {
              sessionId: id,
              chatId: msg.chatId || msg.from,
              originalFrom: msg.from,
            });
            this.eventsGateway.emitMessage(id, wsPayload);
          } catch (err: unknown) {
            this.logger.error(
              `❌ Unhandled error in onMessage pipeline`,
              err instanceof Error ? err.message : String(err),
              { sessionId: id, messageId: message.id },
            );
          }
        })();
      },
      onDisconnected: (reason: string): void => {
        this.logger.warn(`Session disconnected: ${reason}`, {
          sessionId: id,
          reason,
          action: 'disconnected',
        });

        // Execute hook for disconnected event
        void this.hookManager.execute(
          'session:disconnected',
          { reason },
          {
            sessionId: id,
            source: 'Engine',
          },
        );

        void this.updateStatus(id, SessionStatus.DISCONNECTED);

        // Attempt to reconnect
        this.scheduleReconnect(id, session);
      },
      onStateChanged: (engineState: EngineStatus): void => {
        const statusMap: Record<EngineStatus, SessionStatus> = {
          [EngineStatus.DISCONNECTED]: SessionStatus.DISCONNECTED,
          [EngineStatus.INITIALIZING]: SessionStatus.INITIALIZING,
          [EngineStatus.QR_READY]: SessionStatus.QR_READY,
          [EngineStatus.AUTHENTICATING]: SessionStatus.AUTHENTICATING,
          [EngineStatus.READY]: SessionStatus.READY,
          [EngineStatus.FAILED]: SessionStatus.FAILED,
        };
        const newStatus = statusMap[engineState];
        if (newStatus) {
          void this.updateStatus(id, newStatus);
        }
      },
    });

    await this.updateStatus(id, SessionStatus.INITIALIZING);
  }

  private scheduleReconnect(id: string, session: Session): void {
    const state = this.reconnectStates.get(id);
    if (!state) return;

    if (state.attempts >= state.maxAttempts) {
      this.logger.error(`Max reconnect attempts reached for session: ${session.name}`, undefined, {
        sessionId: id,
        attempts: state.attempts,
        action: 'reconnect_failed',
      });
      return;
    }

    // Exponential backoff: baseDelay * 2^attempts (with jitter)
    const delay = state.baseDelay * Math.pow(2, state.attempts) + Math.random() * 1000;
    state.attempts++;

    this.logger.log(
      `Scheduling reconnect attempt ${state.attempts}/${state.maxAttempts} in ${Math.round(delay / 1000)}s`,
      {
        sessionId: id,
        attempt: state.attempts,
        delayMs: delay,
        action: 'reconnect_scheduled',
      },
    );

    state.timer = setTimeout(() => {
      void this.executeReconnect(id, session, state);
    }, delay);
  }

  private async executeReconnect(id: string, session: Session, state: ReconnectState): Promise<void> {
    try {
      // Clean up old engine
      const oldEngine = this.engines.get(id);
      if (oldEngine) {
        await oldEngine.destroy();
        this.engines.delete(id);
      }

      // Re-initialize
      await this.initializeEngine(id, session);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Reconnect attempt ${state.attempts} failed`, errorMessage, {
        sessionId: id,
        action: 'reconnect_error',
      });
      // Schedule another attempt
      this.scheduleReconnect(id, session);
    }
  }

  private cancelReconnect(id: string): void {
    const state = this.reconnectStates.get(id);
    if (state?.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    this.reconnectStates.delete(id);
  }

  async stop(id: string): Promise<Session> {
    const session = await this.findOne(id);

    // Cancel any reconnection attempts
    this.cancelReconnect(id);

    const engine = this.engines.get(id);

    if (engine) {
      await engine.disconnect();
      this.engines.delete(id);
    }

    this.logger.log(`Session stopped: ${session.name}`, {
      sessionId: id,
      action: 'stop',
    });
    await this.updateStatus(id, SessionStatus.DISCONNECTED);
    return this.findOne(id);
  }

  async getQRCode(id: string): Promise<{ qrCode: string; status: SessionStatus }> {
    const session = await this.findOne(id);
    const engine = this.engines.get(id);

    if (!engine) {
      throw new BadRequestException('Session is not started. Call POST /sessions/:id/start first.');
    }

    const qrCode = engine.getQRCode();

    if (!qrCode) {
      if (session.status === SessionStatus.READY) {
        throw new BadRequestException('Session is already authenticated, no QR code needed');
      }
      throw new BadRequestException('QR code is not ready yet. Please wait...');
    }

    return {
      qrCode,
      status: session.status,
    };
  }

  getEngine(id: string): IWhatsAppEngine | undefined {
    return this.engines.get(id);
  }

  async getGroups(id: string): Promise<{ id: string; name: string }[]> {
    await this.findOne(id); // Verify session exists
    const engine = this.engines.get(id);

    if (!engine) {
      throw new BadRequestException('Session is not started');
    }

    const groups = await engine.getGroups();
    return groups.map(g => ({
      id: g.id,
      name: g.name,
    }));
  }

  private async updateStatus(id: string, status: SessionStatus): Promise<void> {
    await this.sessionRepository.update(id, { status });
    this.logger.debug(`Session status updated to ${status}`, {
      sessionId: id,
      status,
      action: 'status_update',
    });
    // Emit real-time event to connected WebSocket clients
    this.eventsGateway.emitSessionStatus(id, status);
  }

  /**
   * Get overall session statistics for multi-session monitoring
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    ready: number;
    disconnected: number;
    byStatus: Record<string, number>;
    memoryUsage: { heapUsed: number; heapTotal: number; rss: number };
  }> {
    const sessions = await this.findAll();
    const byStatus: Record<string, number> = {};

    for (const session of sessions) {
      byStatus[session.status] = (byStatus[session.status] || 0) + 1;
    }

    const memory = process.memoryUsage();

    return {
      total: sessions.length,
      active: this.engines.size,
      ready: byStatus[SessionStatus.READY] || 0,
      disconnected: byStatus[SessionStatus.DISCONNECTED] || 0,
      byStatus,
      memoryUsage: {
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        rss: Math.round(memory.rss / 1024 / 1024),
      },
    };
  }

  /**
   * Get count of currently active (running) sessions
   */
  getActiveCount(): number {
    return this.engines.size;
  }

  /**
   * Check if session is currently active (engine running)
   */
  isActive(id: string): boolean {
    return this.engines.has(id);
  }
}
