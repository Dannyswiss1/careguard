import { createCareRecipientsStore } from '../services/care-recipients/db.ts';
import { logger } from '../shared/logger.ts';

// Instantiating CareRecipientsStore runs migrate() + seedIfEmpty() automatically.
const store = createCareRecipientsStore();
const recipients = store.list();
logger.info(`care_recipients migration complete. ${recipients.length} recipient(s):`);
for (const r of recipients) {
  logger.info(`  [${r.id}] ${r.name} (age ${r.age ?? '?'})`);
}
