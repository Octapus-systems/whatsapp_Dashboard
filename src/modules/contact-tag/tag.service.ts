import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from './entities/tag.entity';
import { CreateTagDto, UpdateTagDto } from './dto';

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(Tag, 'data')
    private readonly tagRepository: Repository<Tag>,
  ) {}

  async create(dto: CreateTagDto): Promise<Tag> {
    const existing = await this.tagRepository.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Tag '${dto.name}' already exists`);
    }

    const tag = this.tagRepository.create({
      name: dto.name,
      color: dto.color || '#6366f1',
    });

    return this.tagRepository.save(tag);
  }

  async findAll(): Promise<Tag[]> {
    return this.tagRepository.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Tag> {
    const tag = await this.tagRepository.findOne({ where: { id } });
    if (!tag) {
      throw new NotFoundException(`Tag with id '${id}' not found`);
    }
    return tag;
  }

  async update(id: string, dto: UpdateTagDto): Promise<Tag> {
    const tag = await this.findOne(id);

    if (dto.name !== undefined && dto.name !== tag.name) {
      const existing = await this.tagRepository.findOne({ where: { name: dto.name } });
      if (existing) {
        throw new ConflictException(`Tag '${dto.name}' already exists`);
      }
      tag.name = dto.name;
    }

    if (dto.color !== undefined) {
      tag.color = dto.color;
    }

    return this.tagRepository.save(tag);
  }

  async delete(id: string): Promise<void> {
    const tag = await this.findOne(id);
    await this.tagRepository.remove(tag);
  }
}
