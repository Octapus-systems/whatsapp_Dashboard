import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactTag } from './entities/contact-tag.entity';
import { SetContactTagsDto, AddContactTagDto } from './dto';

@Injectable()
export class ContactTagService {
  constructor(
    @InjectRepository(ContactTag, 'data')
    private readonly contactTagRepository: Repository<ContactTag>,
  ) {}

  async findBySession(sessionId: string, tag?: string): Promise<ContactTag[]> {
    const records = await this.contactTagRepository.find({
      where: { sessionId },
      order: { updatedAt: 'DESC' },
    });

    if (tag) {
      return records.filter(r => r.tags.includes(tag));
    }

    return records;
  }

  async findOne(sessionId: string, jid: string): Promise<ContactTag | null> {
    return this.contactTagRepository.findOne({ where: { sessionId, jid } });
  }

  private async getOrCreate(sessionId: string, jid: string, name?: string): Promise<ContactTag> {
    let record = await this.findOne(sessionId, jid);
    if (!record) {
      record = this.contactTagRepository.create({ sessionId, jid, name: name || null, tags: [] });
    } else if (name !== undefined) {
      record.name = name;
    }
    return record;
  }

  /** Replace the full set of tags assigned to a contact. */
  async setTags(sessionId: string, jid: string, dto: SetContactTagsDto): Promise<ContactTag> {
    const record = await this.getOrCreate(sessionId, jid, dto.name);
    record.tags = Array.from(new Set(dto.tags));
    return this.contactTagRepository.save(record);
  }

  /** Add a single tag to a contact (idempotent). */
  async addTag(sessionId: string, jid: string, dto: AddContactTagDto): Promise<ContactTag> {
    const record = await this.getOrCreate(sessionId, jid, dto.name);
    if (!record.tags.includes(dto.tag)) {
      record.tags = [...record.tags, dto.tag];
    }
    return this.contactTagRepository.save(record);
  }

  /** Remove a single tag from a contact. */
  async removeTag(sessionId: string, jid: string, tag: string): Promise<ContactTag> {
    const record = await this.findOne(sessionId, jid);
    if (!record) {
      throw new NotFoundException(`No tags found for contact '${jid}' in session '${sessionId}'`);
    }
    record.tags = record.tags.filter(t => t !== tag);
    return this.contactTagRepository.save(record);
  }

  async delete(sessionId: string, jid: string): Promise<void> {
    const record = await this.findOne(sessionId, jid);
    if (record) {
      await this.contactTagRepository.remove(record);
    }
  }

  /**
   * Claim a chat for the given operator (API key name). Throws if already
   * claimed by someone else — the caller (or an admin) must unassign first.
   */
  async claim(sessionId: string, jid: string, assignedTo: string): Promise<ContactTag> {
    const record = await this.getOrCreate(sessionId, jid);
    if (record.assignedTo && record.assignedTo !== assignedTo) {
      throw new ForbiddenException(`Chat is already claimed by '${record.assignedTo}'`);
    }
    record.assignedTo = assignedTo;
    record.assignedAt = new Date();
    return this.contactTagRepository.save(record);
  }

  /**
   * Release a chat claim. Only the operator who holds the claim (or an
   * admin, via `force`) may release it.
   */
  async unassign(sessionId: string, jid: string, requestedBy: string, force = false): Promise<ContactTag> {
    const record = await this.findOne(sessionId, jid);
    if (!record || !record.assignedTo) {
      throw new NotFoundException(`No active claim for contact '${jid}' in session '${sessionId}'`);
    }
    if (!force && record.assignedTo !== requestedBy) {
      throw new ForbiddenException(`Chat is claimed by '${record.assignedTo}', not '${requestedBy}'`);
    }
    record.assignedTo = null;
    record.assignedAt = null;
    return this.contactTagRepository.save(record);
  }
}
