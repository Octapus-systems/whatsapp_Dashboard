import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { TagService } from './tag.service';
import { CreateTagDto, UpdateTagDto, TagResponseDto } from './dto';
import { Tag } from './entities/tag.entity';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('tags')
@Controller('tags')
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Create a tag definition' })
  @ApiResponse({ status: 201, description: 'Tag created', type: TagResponseDto })
  @ApiResponse({ status: 409, description: 'Tag with this name already exists' })
  async create(@Body() dto: CreateTagDto): Promise<Tag> {
    return this.tagService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all tag definitions' })
  @ApiResponse({ status: 200, description: 'List of tags', type: [TagResponseDto] })
  async findAll(): Promise<Tag[]> {
    return this.tagService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a tag definition by ID' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 200, description: 'Tag details', type: TagResponseDto })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async findOne(@Param('id') id: string): Promise<Tag> {
    return this.tagService.findOne(id);
  }

  @Put(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Rename or recolor a tag definition' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 200, description: 'Tag updated', type: TagResponseDto })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  @ApiResponse({ status: 409, description: 'Tag with this name already exists' })
  async update(@Param('id') id: string, @Body() dto: UpdateTagDto): Promise<Tag> {
    return this.tagService.update(id, dto);
  }

  @Delete(':id')
  @RequireRole(ApiKeyRole.OPERATOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tag definition' })
  @ApiParam({ name: 'id', description: 'Tag ID' })
  @ApiResponse({ status: 204, description: 'Tag deleted' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async delete(@Param('id') id: string): Promise<void> {
    return this.tagService.delete(id);
  }
}
