import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { Session } from '../../session/entities/session.entity';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

/**
 * Persisted tag assignments for a WhatsApp contact.
 *
 * WhatsApp contacts themselves are NOT duplicated here — they are derived
 * live from the WA engine (see ContactController / engine.getContacts()).
 * This entity only stores the minimal identifying key (sessionId + jid)
 * needed to join tag data onto the live contact list, plus the tag names
 * assigned to that contact. A denormalized `name` snapshot is kept purely
 * as a display convenience for tag-management UIs (e.g. listing "who has
 * tag X") without needing to re-fetch the live engine contact.
 */
@Entity('contact_tags')
@Unique(['sessionId', 'jid'])
@Index(['sessionId'])
export class ContactTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => Session, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: Session;

  @Column({ type: 'varchar', length: 255 })
  jid: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: jsonColumnType(), default: '[]' })
  tags: string[];

  /**
   * Operator/agent claim on this conversation, so multiple operators don't
   * collide replying to the same contact. Stores the API key's `name`
   * (label) as the assignee identifier — there is no separate per-user
   * login system in this app, so the API key label doubles as operator
   * identity.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  assignedTo: string | null;

  @Column({ type: dateColumnType(), nullable: true, transformer: DateTransformer })
  assignedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
