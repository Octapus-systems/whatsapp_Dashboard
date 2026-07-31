import { Controller, Get, Put, Post, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ContactTagService } from './contact-tag.service';
import { SetContactTagsDto, AddContactTagDto, ContactTagResponseDto } from './dto';
import { ContactTag } from './entities/contact-tag.entity';
import { RequireRole, CurrentApiKey } from '../auth/decorators/auth.decorators';
import { ApiKeyRole, ApiKey } from '../auth/entities/api-key.entity';

@ApiTags('contact-tags')
@Controller('sessions/:sessionId/contact-tags')
export class ContactTagController {
  constructor(private readonly contactTagService: ContactTagService) {}

  @Get()
  @ApiOperation({ summary: 'List contact tag assignments for a session, optionally filtered by tag' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiQuery({ name: 'tag', required: false, description: 'Filter to contacts having this tag name' })
  @ApiResponse({ status: 200, description: 'List of contact tag assignments', type: [ContactTagResponseDto] })
  async findBySession(@Param('sessionId') sessionId: string, @Query('tag') tag?: string): Promise<ContactTag[]> {
    return this.contactTagService.findBySession(sessionId, tag);
  }

  @Get(':jid')
  @ApiOperation({ summary: 'Get tags assigned to a specific contact' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'jid', description: 'Contact JID/phone (e.g. 628xxx@c.us)' })
  @ApiResponse({ status: 200, description: 'Tags for the contact (empty tags array if none set)' })
  async findOne(@Param('sessionId') sessionId: string, @Param('jid') jid: string) {
    const record = await this.contactTagService.findOne(sessionId, jid);
    return record ?? { sessionId, jid, name: null, tags: [] };
  }

  @Put(':jid')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Replace the full set of tags assigned to a contact' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'jid', description: 'Contact JID/phone (e.g. 628xxx@c.us)' })
  @ApiResponse({ status: 200, description: 'Tags updated', type: ContactTagResponseDto })
  async setTags(
    @Param('sessionId') sessionId: string,
    @Param('jid') jid: string,
    @Body() dto: SetContactTagsDto,
  ): Promise<ContactTag> {
    return this.contactTagService.setTags(sessionId, jid, dto);
  }

  @Post(':jid/tags')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Add a single tag to a contact' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'jid', description: 'Contact JID/phone (e.g. 628xxx@c.us)' })
  @ApiResponse({ status: 200, description: 'Tag added', type: ContactTagResponseDto })
  async addTag(
    @Param('sessionId') sessionId: string,
    @Param('jid') jid: string,
    @Body() dto: AddContactTagDto,
  ): Promise<ContactTag> {
    return this.contactTagService.addTag(sessionId, jid, dto);
  }

  @Delete(':jid/tags/:tag')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Remove a single tag from a contact' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'jid', description: 'Contact JID/phone (e.g. 628xxx@c.us)' })
  @ApiParam({ name: 'tag', description: 'Tag name to remove' })
  @ApiResponse({ status: 200, description: 'Tag removed', type: ContactTagResponseDto })
  async removeTag(
    @Param('sessionId') sessionId: string,
    @Param('jid') jid: string,
    @Param('tag') tag: string,
  ): Promise<ContactTag> {
    return this.contactTagService.removeTag(sessionId, jid, tag);
  }

  @Delete(':jid')
  @RequireRole(ApiKeyRole.OPERATOR)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clear all tags for a contact' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'jid', description: 'Contact JID/phone (e.g. 628xxx@c.us)' })
  @ApiResponse({ status: 204, description: 'Contact tag record deleted' })
  async delete(@Param('sessionId') sessionId: string, @Param('jid') jid: string): Promise<void> {
    return this.contactTagService.delete(sessionId, jid);
  }

  @Post(':jid/claim')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Claim (assign) a chat to the current operator, so others know it is being handled' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'jid', description: 'Contact JID/phone (e.g. 628xxx@c.us)' })
  @ApiResponse({ status: 200, description: 'Chat claimed', type: ContactTagResponseDto })
  @ApiResponse({ status: 403, description: 'Chat already claimed by another operator' })
  async claim(
    @Param('sessionId') sessionId: string,
    @Param('jid') jid: string,
    @CurrentApiKey() apiKey: ApiKey,
  ): Promise<ContactTag> {
    return this.contactTagService.claim(sessionId, jid, apiKey.name);
  }

  @Delete(':jid/claim')
  @RequireRole(ApiKeyRole.OPERATOR)
  @ApiOperation({ summary: 'Release the current claim on a chat (admins may force-release any claim)' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'jid', description: 'Contact JID/phone (e.g. 628xxx@c.us)' })
  @ApiResponse({ status: 200, description: 'Chat unassigned', type: ContactTagResponseDto })
  @ApiResponse({ status: 403, description: 'Chat is claimed by another operator' })
  async unassign(
    @Param('sessionId') sessionId: string,
    @Param('jid') jid: string,
    @CurrentApiKey() apiKey: ApiKey,
  ): Promise<ContactTag> {
    return this.contactTagService.unassign(sessionId, jid, apiKey.name, apiKey.role === ApiKeyRole.ADMIN);
  }
}
