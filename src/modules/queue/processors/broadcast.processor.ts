import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { createLogger } from '../../../common/services/logger.service';
import { QUEUE_NAMES } from '../queue-names';
import { BroadcastService } from '../../message/broadcast.service';

export interface BroadcastJobData {
  broadcastId: string;
}

/**
 * Processes scheduled/immediate broadcasts added via BroadcastService using Bull's
 * delayed-job feature (job option `delay`), rather than a cron polling loop.
 * Only registered when QUEUE_ENABLED=true (see message.module.ts).
 */
@Processor(QUEUE_NAMES.BROADCAST)
export class BroadcastProcessor extends WorkerHost {
  private readonly logger = createLogger('BroadcastProcessor');

  constructor(private readonly broadcastService: BroadcastService) {
    super();
  }

  async process(job: Job<BroadcastJobData>): Promise<{ broadcastId: string }> {
    const { broadcastId } = job.data;
    this.logger.log(`Processing broadcast job ${job.id}`, { broadcastId, action: 'broadcast_process_start' });

    await this.broadcastService.processBroadcast(broadcastId);

    this.logger.log(`Finished broadcast job ${job.id}`, { broadcastId, action: 'broadcast_process_done' });
    return { broadcastId };
  }
}
