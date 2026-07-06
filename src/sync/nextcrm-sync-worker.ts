import { startNextcrmSyncWorker } from './nextcrm-sync.js';
import type { Logger } from '../utils/logger.js';

export function bootstrapNextcrmSyncWorker(logger: Logger): void {
  if (!process.env.NEXTCRM_URL || !process.env.NEXTCRM_SYNC_TOKEN) {
    logger.warn('nextcrm-sync: NEXTCRM_URL/NEXTCRM_SYNC_TOKEN not set, worker disabled');
    return;
  }
  startNextcrmSyncWorker(logger);
  logger.info('nextcrm-sync worker started');
}
