import 'dotenv/config';
import { BotConfigStore } from '../src/db/bot-config-store.js';

async function main() {
  const store = new BotConfigStore();
  const jsonPath = process.env.BOTS_CONFIG || 'bots.json';
  console.log(`Seeding from ${jsonPath}...`);
  const result = await store.seedFromJson(jsonPath);
  console.log(`Done: ${result.seeded} seeded, ${result.skipped} skipped`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
