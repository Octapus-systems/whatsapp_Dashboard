import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

/**
 * A tag definition (label the user creates once and re-uses across contacts).
 * Not session-scoped: tag definitions are global to the install so the same
 * "VIP" or "Lead" tag can be applied to contacts across different sessions.
 */
@Entity('tags')
@Unique(['name'])
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 20, default: '#6366f1' })
  color: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
