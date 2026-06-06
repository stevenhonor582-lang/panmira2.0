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
      // Use start-safe.sh wrapper: runs tsc --noEmit before tsx,
      // preventing crash loops from syntax errors
      script: 'bin/start-safe.sh',
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
  ],
};
