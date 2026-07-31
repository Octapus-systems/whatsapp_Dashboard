import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Webhook } from './webhook.entity';
import { jsonColumnType } from '../../../common/utils/column-types';

@Entity('webhook_deliveries')
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  webhookId: string;

  @ManyToOne(() => Webhook, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'webhookId' })
  webhook: Webhook;

  @Column({ type: 'varchar', length: 64 })
  deliveryId: string;

  @Column({ type: 'varchar', length: 128 })
  event: string;

  @Column({ type: 'int', nullable: true })
  statusCode: number | null;

  @Column({ type: 'boolean', default: false })
  success: boolean;

  @Column({ type: 'int', default: 1 })
  attempt: number;

  @Column({ type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ type: jsonColumnType(), nullable: true })
  requestPayload: Record<string, unknown> | null;

  @Column({ type: jsonColumnType(), nullable: true })
  requestHeaders: Record<string, string> | null;

  @Column({ type: jsonColumnType(), nullable: true })
  responsePayload: Record<string, unknown> | string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
