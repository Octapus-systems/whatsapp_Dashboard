import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TemplateService } from './template.service';
import { CreateMessageTemplateDto, UpdateMessageTemplateDto, MessageTemplateResponseDto } from './dto';
import { MessageTemplate } from './entities/message-template.entity';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('templates')
@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create a reusable message template' })
  @ApiResponse({
    status: 201,
    description: 'Template created',
    type: MessageTemplateResponseDto,
  })
  async create(@Body() dto: CreateMessageTemplateDto): Promise<MessageTemplate> {
    return this.templateService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all message templates' })
  @ApiResponse({
    status: 200,
    description: 'List of message templates',
    type: [MessageTemplateResponseDto],
  })
  async findAll(): Promise<MessageTemplate[]> {
    return this.templateService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a message template by ID' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  @ApiResponse({
    status: 200,
    description: 'Template details',
    type: MessageTemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async findOne(@Param('id') id: string): Promise<MessageTemplate> {
    return this.templateService.findOne(id);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Update a message template' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  @ApiResponse({
    status: 200,
    description: 'Template updated',
    type: MessageTemplateResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateMessageTemplateDto): Promise<MessageTemplate> {
    return this.templateService.update(id, dto);
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a message template' })
  @ApiParam({ name: 'id', description: 'Template ID' })
  @ApiResponse({ status: 204, description: 'Template deleted' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async delete(@Param('id') id: string): Promise<void> {
    return this.templateService.delete(id);
  }
}
