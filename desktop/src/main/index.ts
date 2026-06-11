import { createMainWindow } from './lifecycle.js';
createMainWindow().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
