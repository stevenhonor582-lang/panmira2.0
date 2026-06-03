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
      script: 'src/index.ts',
      interpreter: path.join(__dirname, 'node_modules/.bin/tsx'),
      cwd: __dirname,
      node_args: '--no-warnings=DeprecationWarning',

      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 3000,

      error_file: path.join(__dirname, 'logs', 'error.log'),
      out_file: path.join(__dirname, 'logs', 'out.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      env: Object.assign({ NODE_ENV: 'production', NODE_OPTIONS: '--no-warnings=DeprecationWarning' }, envVars),
    },
  ],
};
