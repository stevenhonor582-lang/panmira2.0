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
    env: {
      NODE_ENV: "production",
      DATABASE_URL: process.env.DATABASE_URL,
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
      USE_SDK_CORE_BOTS: "得一",
    },
  }],
};
