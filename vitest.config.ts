import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/panmira_test',
      JWT_SECRET: 'test-jwt-secret-32-chars-minimum-aaaa',
      ENCRYPTION_KEY: 'a'.repeat(64),
    },
  },
});
