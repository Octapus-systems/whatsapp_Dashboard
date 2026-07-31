import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { BroadcastService } from './broadcast.service';
import { CreateBroadcastDto, BroadcastResponseDto } from './dto/broadcast.dto';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';

@ApiTags('broadcasts')
@Controller('sessions/:sessionId/broadcasts')
export class BroadcastController {
  constructor(private readonly broadcastService: BroadcastService) {}

  @Post()
  @RequireRole(ApiKeyRole.OPERATOR)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Create a broadcast: send one message to many recipients, now or scheduled' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 202, description: 'Broadcast created and queued/started', type: BroadcastResponseDto })
  @ApiResponse({ status: 400, description: 'Session not active or invalid request' })
  async createBroadcast(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateBroadcastDto,
  ): Promise<BroadcastResponseDto> {
    const broadcast = await this.broadcastService.createBroadcast(sessionId, dto);
    const perMessageDelay = broadcast.options?.delayBetweenMessages || 3000;
    const startAt = broadcast.scheduledAt ? broadcast.scheduledAt.getTime() : Date.now();
    const estimatedTime = new Date(startAt + broadcast.recipients.length * perMessageDelay);

    return {
      broadcastId: broadcast.broadcastId,
      status: broadcast.status,
      totalRecipients: broadcast.recipients.length,
      scheduledAt: broadcast.scheduledAt ? broadcast.scheduledAt.toISOString() : undefined,
      estimatedCompletionTime: estimatedTime.toISOString(),
      statusUrl: `/api/sessions/${sessionId}/broadcasts/${broadcast.broadcastId}`,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List past and pending broadcasts for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'List of broadcasts' })
  async listBroadcasts(@Param('sessionId') sessionId: string) {
    const broadcasts = await this.broadcastService.listBroadcasts(sessionId);
    return broadcasts.map(b => ({
      broadcastId: b.broadcastId,
      status: b.status,
      message: b.message,
      totalRecipients: b.recipients.length,
      scheduledAt: b.scheduledAt,
      progress: b.progress,
      startedAt: b.startedAt,
      completedAt: b.completedAt,
      createdAt: b.createdAt,
    }));
  }

  @Get(':broadcastId')
  @ApiOperation({ summary: 'Get broadcast status and progress' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'broadcastId', description: 'Broadcast ID' })
  @ApiResponse({ status: 200, description: 'Broadcast status and progress' })
  @ApiResponse({ status: 404, description: 'Broadcast not found' })
  async getBroadcastStatus(@Param('sessionId') sessionId: string, @Param('broadcastId') broadcastId: string) {
    const broadcast = await this.broadcastService.getBroadcastStatus(sessionId, broadcastId);
    return {
      broadcastId: broadcast.broadcastId,
      status: broadcast.status,
      message: broadcast.message,
      recipients: broadcast.recipients,
      scheduledAt: broadcast.scheduledAt,
      progress: broadcast.progress,
      results: broadcast.results,
      startedAt: broadcast.startedAt,
      completedAt: broadcast.completedAt,
    };
  }

  @Post(':broadcastId/cancel')
  @RequireRole(ApiKeyRole.OPERATOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a pending, scheduled, or running broadcast' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'broadcastId', description: 'Broadcast ID' })
  @ApiResponse({ status: 200, description: 'Broadcast cancelled' })
  @ApiResponse({ status: 400, description: 'Broadcast already completed or cancelled' })
  @ApiResponse({ status: 404, description: 'Broadcast not found' })
  async cancelBroadcast(@Param('sessionId') sessionId: string, @Param('broadcastId') broadcastId: string) {
    const broadcast = await this.broadcastService.cancelBroadcast(sessionId, broadcastId);
    return {
      broadcastId: broadcast.broadcastId,
      status: broadcast.status,
      progress: broadcast.progress,
    };
  }
}
