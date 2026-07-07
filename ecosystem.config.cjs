// 重要: 敏感 env vars(JWT_SECRET 等) **不** 在这里设置
// pm2 会自动从 cwd/.env 读取并注入到 process.env
// 然后 panmira app 启动时由 dotenv/config 加载 .env (有重复保护)
// 这样既保持 .env 真凭证 gitignored,又不会泄漏到 ecosystem

module.exports = {
  apps: [
    {
      name: 'panmira',
      script: 'dist/index.js',
      cwd: '/home/ubuntu/panmira-N1',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        API_PORT: '9100',
        LOG_LEVEL: 'info',
        NODE_OPTIONS: '--no-deprecation',
        MEMORY_ENABLED: 'true',
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
        CLAUDE_DEFAULT_WORKING_DIRECTORY: './workspace',
        PANMIRA_SOURCE_NAME: 'mah',
        USE_SDK_CORE_BOTS: '得一,玄鉴,不盈,守约',
      }
    },
    {
      name: 'web-next',
      script: 'node node_modules/next/dist/bin/next start -p 3200 -H 127.0.0.1',
      cwd: '/home/ubuntu/panmira-N1/apps/web-next',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        NODE_OPTIONS: '--no-deprecation',
        NEXT_PUBLIC_API_BASE: 'http://localhost:9100',
      }
    }
  ]
};
