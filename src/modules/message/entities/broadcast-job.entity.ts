import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { DateTransformer } from '../../../common/transformers/date.transformer';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';

export enum BroadcastStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
}

export enum BroadcastRecipientStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface BroadcastRecipientResult {
  chatId: string;
  status: BroadcastRecipientStatus;
  messageId?: string;
  error?: string;
  sentAt?: Date;
}

export interface BroadcastProgress {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  cancelled: number;
}

@Entity('broadcast_jobs')
export class BroadcastJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'broadcast_id', unique: true })
  broadcastId: string;

  @Column({ name: 'session_id' })
  sessionId: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: jsonColumnType() })
  recipients: string[];

  @Column({ type: 'varchar', default: BroadcastStatus.PENDING })
  status: BroadcastStatus;

  @Column({ name: 'scheduled_at', type: dateColumnType(), nullable: true, transformer: DateTransformer })
  scheduledAt: Date | null;

  @Column({ name: 'bull_job_id', nullable: true })
  bullJobId: string | null;

  @Column({ type: jsonColumnType(), nullable: true })
  options: {
    delayBetweenMessages: number;
    randomizeDelay: boolean;
    stopOnError: boolean;
  };

  @Column({ type: jsonColumnType(), nullable: true })
  progress: BroadcastProgress;

  @Column({ type: jsonColumnType(), nullable: true })
  results: BroadcastRecipientResult[];

  @Column({ name: 'current_index', default: 0 })
  currentIndex: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'started_at', type: dateColumnType(), nullable: true, transformer: DateTransformer })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: dateColumnType(), nullable: true, transformer: DateTransformer })
  completedAt: Date | null;
}
