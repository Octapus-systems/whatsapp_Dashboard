import { Module, forwardRef, Type, DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageService } from './message.service';
import { BulkMessageService } from './bulk-message.service';
import { BroadcastService } from './broadcast.service';
import { MessageController } from './message.controller';
import { BroadcastController } from './broadcast.controller';
import { SessionModule } from '../session/session.module';
import { Message } from './entities/message.entity';
import { MessageBatch } from './entities/message-batch.entity';
import { BroadcastJob } from './entities/broadcast-job.entity';
import { QUEUE_NAMES } from '../queue/queue-names';

// The broadcast feature uses Bull's delayed-job support for scheduled sends, but Bull
// requires a live Redis connection (registered by QueueModule). To keep the app bootable
// without Redis, only register the broadcast queue + its worker when QUEUE_ENABLED=true
// (mirroring the guard already used for QueueModule in app.module.ts). When disabled,
// BroadcastService falls back to an in-process setTimeout/async loop, same idea as
// BulkMessageService's non-queue processing.
const broadcastImports: DynamicModule[] = [];
const broadcastProviders: Type<unknown>[] = [MessageService, BulkMessageService, BroadcastService];

if (process.env.QUEUE_ENABLED === 'true') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BullModule } = require('@nestjs/bullmq') as typeof import('@nestjs/bullmq');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BroadcastProcessor } = require('../queue/processors/broadcast.processor') as {
    BroadcastProcessor: Type<unknown>;
  };
  broadcastImports.push(BullModule.registerQueue({ name: QUEUE_NAMES.BROADCAST }));
  broadcastProviders.push(BroadcastProcessor);
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, MessageBatch, BroadcastJob], 'data'),
    forwardRef(() => SessionModule),
    ...broadcastImports,
  ],
  controllers: [MessageController, BroadcastController],
  providers: broadcastProviders,
  exports: [MessageService, BulkMessageService, BroadcastService],
})
export class MessageModule {}
