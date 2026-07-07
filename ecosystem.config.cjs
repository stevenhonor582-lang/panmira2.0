module.exports = {
  apps: [{
    name: 'panmira',
    script: 'dist/index.js',
    cwd: '/home/ubuntu/panmira-N1',
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://ubuntu:ubuntu@localhost:5432/metabot',
      JWT_SECRET: 'metabot_jwt_secret_cc1af1583911a44cbd6a36a921cd3147',
      API_SECRET: 'metabot2025secret',
      API_PORT: '9100',
      LOG_LEVEL: 'info',
      NODE_OPTIONS: '--no-deprecation',
      MEMORY_ENABLED: 'true',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
      CLAUDE_DEFAULT_WORKING_DIRECTORY: './workspace',
      ENCRYPTION_KEY: '8c3e58c273f3dc74a9d5642b19de1882e338e94255f2633aeca662313c2e8347',
      ANTHROPIC_AUTH_TOKEN: 'sk-68232cd5177642a3a0aea42c3a7d8b85',
      ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
      OPENAI_API_KEY: 'sk-dcgktybutfitkgzbpkqvbuhkqcndzycjakpgnfddtbqwinaf',
      OPENAI_BASE_URL: 'https://api.siliconflow.cn/v1',
      OPENAI_EMBEDDING_MODEL: 'BAAI/bge-m3',
      NEXTCRM_URL: 'https://crm.sites.panmira.cn',
      NEXTCRM_SYNC_TOKEN: '1e917bef6cd4ef6e7a301a64fd147e9c00f2cde7edb9e105',
      NEXTCRM_SYNC_INTERVAL_MS: '60000',
      PANMIRA_SOURCE_NAME: 'mah',
      USE_SDK_CORE_BOTS: '得一,玄鉴,不盈,守约',
    }
  }]
};
