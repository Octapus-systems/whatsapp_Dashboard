import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageTemplate } from './entities/message-template.entity';
import { CreateMessageTemplateDto, UpdateMessageTemplateDto } from './dto';

@Injectable()
export class TemplateService {
  constructor(
    @InjectRepository(MessageTemplate, 'data')
    private readonly templateRepository: Repository<MessageTemplate>,
  ) {}

  async create(dto: CreateMessageTemplateDto): Promise<MessageTemplate> {
    const template = this.templateRepository.create({
      name: dto.name,
      content: dto.content,
    });

    return this.templateRepository.save(template);
  }

  async findAll(): Promise<MessageTemplate[]> {
    return this.templateRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<MessageTemplate> {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Message template with id '${id}' not found`);
    }
    return template;
  }

  async update(id: string, dto: UpdateMessageTemplateDto): Promise<MessageTemplate> {
    const template = await this.findOne(id);

    if (dto.name !== undefined) template.name = dto.name;
    if (dto.content !== undefined) template.content = dto.content;

    return this.templateRepository.save(template);
  }

  async delete(id: string): Promise<void> {
    const template = await this.findOne(id);
    await this.templateRepository.remove(template);
  }
}
