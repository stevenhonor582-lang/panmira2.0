const path = require('path');
const fs = require('fs');

// Parse .env manually
const envPath = path.join(__dirname, '.env');
const envVars = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
  }
}

module.exports = {
  apps: [
    {
      name: 'panmira',
      // Production: run compiled dist/ output (no tsc, no tsx needed)
      // Dev: switch to bin/start-safe.sh for tsx + type checking
      script: 'bin/start-production.sh',
      interpreter: '/bin/bash',
      cwd: __dirname,

      watch: false,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '30s',
      restart_delay: 5000,
      kill_timeout: 15000,

      error_file: path.join(__dirname, 'logs', 'error.log'),
      out_file: path.join(__dirname, 'logs', 'out.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      env: Object.assign({ NODE_ENV: 'production' }, envVars),
    },
    {
      // C-fix 2026-06-20: hourly memory system health check
      // Schedule: every hour at :05 (avoid collision with extraction cron)
      name: 'monitor-extraction',
      script: 'scripts/monitor-extraction.mjs',
      interpreter: 'node',
      cwd: __dirname,

      cron_restart: '5 * * * *',
      autorestart: false,
      watch: false,
      max_restarts: 0,
      kill_timeout: 60000,

      error_file: path.join(__dirname, 'logs', 'monitor-error.log'),
      out_file: path.join(__dirname, 'logs', 'monitor-out.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      env: Object.assign({ NODE_ENV: 'production' }, envVars),
    },
      // 2026-06-27 commit 4: 真正的 batch extraction worker
      // 之前 extraction-worker.mjs 只是健康检查, 不实际抽取
      // 这个 worker 才真的调 LLM 抽取 + 飞书告警 + auto-restart
      {
        name: 'batch-extract-worker',
        script: 'scripts/batch-extract-worker.mjs',
        interpreter: 'node',
        cwd: __dirname,
        cron_restart: '0 */6 * * *',
        max_memory_restart: '500M',
        env: Object.assign({ NODE_ENV: 'production' }, envVars),
      },
      // Extraction worker: 6h-window health check + sync verification
      // Schedule: every 6 hours at minute 0 (avoids collision with monitor-extraction)
      {
      name: 'extraction-worker',
      script: 'scripts/extraction-worker.mjs',
      interpreter: 'node',
      cwd: __dirname,

      cron_restart: '0 */6 * * *',
      autorestart: false,
      watch: false,
      max_restarts: 0,
      kill_timeout: 60000,

      error_file: path.join(__dirname, 'logs', 'extraction-error.log'),
      out_file: path.join(__dirname, 'logs', 'extraction-out.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      env: Object.assign({ NODE_ENV: 'production' }, envVars),
    },
  ],
};
