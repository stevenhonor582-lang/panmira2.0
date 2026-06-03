import { createClient } from 'redis';
import { pool } from '../db/index.js';
import type { Logger } from './logger.js';

interface PreflightResult {
  pass: boolean;
  checks: PreflightCheck[];
}

interface PreflightCheck {
  name: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
}

export async function runPreflight(logger: Logger): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];

  // 1. Check required environment variables
  const requiredEnvVars = [
    'JWT_SECRET',
    'DATABASE_URL',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'API_SECRET',
  ];

  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      checks.push({ name: `ENV:${varName}`, status: 'fail', message: `${varName} is not set` });
    } else if (varName === 'JWT_SECRET' && process.env[varName]!.length < 16) {
      checks.push({ name: `ENV:${varName}`, status: 'warn', message: `${varName} is too short (< 16 chars)` });
    } else {
      checks.push({ name: `ENV:${varName}`, status: 'ok', message: 'Set' });
    }
  }

  // 2. Check PostgreSQL connectivity
  try {
    const result = await pool.query('SELECT 1 AS alive');
    if (result.rows[0]?.alive === 1) {
      checks.push({ name: 'DB:PostgreSQL', status: 'ok', message: 'Connected' });
    } else {
      checks.push({ name: 'DB:PostgreSQL', status: 'fail', message: 'Query returned unexpected result' });
    }
  } catch (err: any) {
    checks.push({ name: 'DB:PostgreSQL', status: 'fail', message: `Cannot connect: ${err.message}` });
  }

  // 3. Check Redis connectivity (if REDIS_URL is configured)
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const redis = createClient({ url: redisUrl, socket: { connectTimeout: 3000 } });
      await redis.connect();
      await redis.ping();
      await redis.quit();
      checks.push({ name: 'Cache:Redis', status: 'ok', message: 'Connected' });
    } catch (err: any) {
      checks.push({ name: 'Cache:Redis', status: 'warn', message: `Cannot connect: ${err.message}` });
    }
  } else {
    // Try default localhost
    try {
      const redis = createClient({ socket: { connectTimeout: 3000 } });
      await redis.connect();
      await redis.ping();
      await redis.quit();
      checks.push({ name: 'Cache:Redis', status: 'ok', message: 'Connected (default)' });
    } catch {
      checks.push({ name: 'Cache:Redis', status: 'warn', message: 'Not available (non-critical)' });
    }
  }

  // 4. Check bots config file
  const botsConfigPath = process.env.BOTS_CONFIG || './bots.json';
  try {
    const fs = await import('node:fs');
    if (fs.existsSync(botsConfigPath)) {
      const raw = fs.readFileSync(botsConfigPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const botCount = parsed.feishuBots?.length || 0;
      checks.push({ name: 'Config:BotsJSON', status: 'ok', message: `${botCount} bots configured` });
    } else {
      checks.push({ name: 'Config:BotsJSON', status: 'fail', message: `File not found: ${botsConfigPath}` });
    }
  } catch (err: any) {
    checks.push({ name: 'Config:BotsJSON', status: 'fail', message: `Parse error: ${err.message}` });
  }

  // 5. Check MetaMemory connectivity
  const memoryUrl = process.env.META_MEMORY_URL;
  if (memoryUrl) {
    try {
      const resp = await fetch(`${memoryUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (resp.ok) {
        checks.push({ name: 'Service:MetaMemory', status: 'ok', message: `Reachable at ${memoryUrl}` });
      } else {
        checks.push({ name: 'Service:MetaMemory', status: 'warn', message: `HTTP ${resp.status}` });
      }
    } catch (err: any) {
      checks.push({ name: 'Service:MetaMemory', status: 'warn', message: `Not reachable: ${err.message}` });
    }
  }

  // Summary
  const failures = checks.filter((c) => c.status === 'fail');
  const warnings = checks.filter((c) => c.status === 'warn');
  const pass = failures.length === 0;

  if (pass) {
    logger.info({ ok: checks.length - warnings.length, warn: warnings.length }, 'Preflight check passed');
  } else {
    logger.error({ failures }, 'Preflight check FAILED — service may crash');
  }

  return { pass, checks };
}
