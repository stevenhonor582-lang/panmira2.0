require("dotenv").config({ path: "./.env" });
module.exports = {
  apps: [{
    name: "panmira",
    script: "dist/index.js",
    cwd: "/home/ubuntu/panmira",
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    max_memory_restart: "2G",
    env: {
      NODE_ENV: "production",
      DATABASE_URL: process.env.DATABASE_URL,
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
      SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
      OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
      PANMIRA_SOURCE_NAME: process.env.PANMIRA_SOURCE_NAME,
      USE_SDK_CORE_BOTS: "得一,玄鉴,不盈,守静,信言",
    },
  }],
};
