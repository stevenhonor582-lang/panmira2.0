require("dotenv").config({ path: "/home/ubuntu/panmira/.env" });
module.exports = {
  apps: [{
    name: "web-next",
    script: "node_modules/next/dist/bin/next",
    args: "start -p 3200 -H 127.0.0.1",
    cwd: "/home/ubuntu/panmira-N1/apps/web-next",
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production",
      PORT: "3200",
    },
  }],
};
