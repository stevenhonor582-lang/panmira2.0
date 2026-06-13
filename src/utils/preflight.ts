import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pool } from '../db/index.js';
import { initWorkspaceSkeleton } from '../workspace-init.js';
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

  // 1b. Auth token: accept either ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  if (!authToken) {
    checks.push({ name: 'ENV:ANTHROPIC_AUTH', status: 'fail', message: 'Neither ANTHROPIC_AUTH_TOKEN nor ANTHROPIC_API_KEY is set' });
  } else {
    checks.push({ name: 'ENV:ANTHROPIC_AUTH', status: 'ok', message: 'Set' });
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

  // 3. Check Redis connectivity via TCP socket (no dependency needed)
  const redisHost = process.env.REDIS_URL ? new URL(process.env.REDIS_URL).hostname : '127.0.0.1';
  const redisPort = process.env.REDIS_URL ? parseInt(new URL(process.env.REDIS_URL).port || '6379') : 6379;
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);
      socket.on('connect', () => { socket.destroy(); resolve(); });
      socket.on('timeout', () => { socket.destroy(); reject(new Error('Connection timeout')); });
      socket.on('error', reject);
      socket.connect(redisPort, redisHost);
    });
    checks.push({ name: 'Cache:Redis', status: 'ok', message: `TCP reachable at ${redisHost}:${redisPort}` });
  } catch (err: any) {
    checks.push({ name: 'Cache:Redis', status: 'warn', message: `Not reachable: ${err.message}` });
  }

  // 4. Check bot count from database
  try {
    const { rows } = await pool.query('SELECT count(*) as count FROM bot_configs WHERE is_active = true');
    const botCount = parseInt(rows[0]?.count || '0');
    if (botCount > 0) {
      checks.push({ name: 'Config:Bots', status: 'ok', message: `${botCount} bots in database` });
    } else {
      checks.push({ name: 'Config:Bots', status: 'fail', message: 'No bots configured. Use Web UI: /web/settings' });
    }
  } catch (err: any) {
    checks.push({ name: 'Config:Bots', status: 'fail', message: `DB query failed: ${err.message}` });
  }

  // 5. Check Claude Code binary + SDK compatibility
  //    Defensive guard against the SDK 0.2.141 regression where cli.js was
  //    removed but code still referenced it (commit b637c5c6 / e3252884).
  try {
    const { execSync } = await import('node:child_process');
    const claudePath = process.env.CLAUDE_EXECUTABLE_PATH
      || execSync('which claude', { encoding: 'utf-8' }).trim().split(/\r?\n/)[0];
    if (claudePath && fs.existsSync(claudePath)) {
      checks.push({ name: 'SDK:ClaudeBinary', status: 'ok', message: `Found at ${claudePath}` });
      try {
        const versionOut = execSync(`${claudePath} --version`, { encoding: 'utf-8', timeout: 5000 }).trim();
        checks.push({ name: 'SDK:ClaudeVersion', status: 'ok', message: versionOut });
      } catch (err: any) {
        checks.push({ name: 'SDK:ClaudeVersion', status: 'warn', message: `Cannot run --version: ${err.message}` });
      }
    } else {
      checks.push({ name: 'SDK:ClaudeBinary', status: 'fail', message: 'claude binary not found in PATH' });
    }
  } catch (err: any) {
    checks.push({ name: 'SDK:ClaudeBinary', status: 'fail', message: `which claude failed: ${err.message}` });
  }

  try {
    const sdkResolve = import.meta.resolve('@anthropic-ai/claude-agent-sdk');
    const sdkDir = path.dirname(new URL(sdkResolve).pathname);
    const cliJs = path.join(sdkDir, 'cli.js');
    const sdkMjs = path.join(sdkDir, 'sdk.mjs');
    if (fs.existsSync(cliJs)) {
      checks.push({
        name: 'SDK:SpawnCompat',
        status: 'warn',
        message: `SDK ships cli.js (${sdkDir}) — old SDK. Code expects 0.2.141+ native binary. May cause "Claude Code process exited with code 1".`,
      });
    } else if (fs.existsSync(sdkMjs)) {
      checks.push({ name: 'SDK:SpawnCompat', status: 'ok', message: 'SDK 0.2.141+ (no cli.js, native binary mode)' });
    } else {
      checks.push({ name: 'SDK:SpawnCompat', status: 'warn', message: `Cannot find sdk.mjs in ${sdkDir}` });
    }
  } catch (err: any) {
    checks.push({ name: 'SDK:SpawnCompat', status: 'warn', message: `Cannot resolve SDK: ${err.message}` });
  }

  // 6. Check MetaMemory connectivity
  const memoryUrl = process.env.META_MEMORY_URL;
  if (memoryUrl) {
    try {
      const resp = await fetch(`${memoryUrl}/api/health`, { signal: AbortSignal.timeout(3000) });
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

/**
 * Validate bot-agent consistency after startup.
 * Checks: agent existence, knowledgeFolders sync, workspace directory.
 * Auto-fixes where possible.
 */
export async function validateBotConsistency(
  allBotNames: string[],
  registry: { get: (name: string) => { config: { agentId?: string; knowledgeFolders?: string[]; claude: { defaultWorkingDirectory: string } } } | undefined },
  logger: Logger,
): Promise<void> {
  let checked = 0;
  let warnings = 0;
  let fixed = 0;

  for (const botName of allBotNames) {
    const botInfo = registry.get(botName);
    if (!botInfo) continue;

    // 1. Check agentId → agents table
    const agentId = botInfo.config.agentId;
    if (agentId) {
      try {
        const { rows } = await pool.query('SELECT id, knowledge_folders FROM agents WHERE id = $1', [agentId]);
        if (rows.length === 0) {
          logger.warn({ botName, agentId }, 'Bot references non-existent agent — check agent template');
          warnings++;
        }
      } catch (err: any) {
        logger.warn({ botName, err: err.message }, 'Agent lookup failed');
        warnings++;
      }
    }

    // 2. Sync knowledgeFolders: bot_configs → agents
    const knowledgeFolders = botInfo.config.knowledgeFolders;
    if (agentId && knowledgeFolders && knowledgeFolders.length > 0) {
      try {
        const { rows } = await pool.query('SELECT knowledge_folders FROM agents WHERE id = $1', [agentId]);
        const current = rows[0]?.knowledge_folders;
        const needsUpdate = !current || JSON.stringify(current) !== JSON.stringify(knowledgeFolders);
        if (needsUpdate) {
          await pool.query('UPDATE agents SET knowledge_folders = $1 WHERE id = $2', [
            JSON.stringify(knowledgeFolders),
            agentId,
          ]);
          logger.info({ botName, folders: knowledgeFolders }, 'Fixed: synced knowledgeFolders to agent');
          fixed++;
        }
      } catch (err: any) {
        logger.warn({ botName, err: err.message }, 'knowledgeFolders sync failed');
        warnings++;
      }
    }

    // 3. Validate workspace skeleton structure and auto-fix missing pieces
    const workDir = botInfo.config.claude?.defaultWorkingDirectory;
    if (workDir) {
      if (!fs.existsSync(workDir)) {
        logger.warn({ botName, workDir }, 'Workspace directory missing — auto-creating with skeleton');
        try {
          initWorkspaceSkeleton(workDir, botName, botName, logger);
          fixed++;
        } catch (err: any) {
          logger.warn({ botName, err: err.message }, 'Failed to auto-create workspace');
          warnings++;
        }
      } else {
        const claudePath = path.join(workDir, 'CLAUDE.md');
        if (!fs.existsSync(claudePath)) {
          try {
            initWorkspaceSkeleton(workDir, botName, botName, logger);
            logger.info({ botName }, 'Fixed: completed missing workspace skeleton files');
            fixed++;
          } catch (err: any) {
            logger.warn({ botName, err: err.message }, 'Failed to patch workspace skeleton');
            warnings++;
          }
        }
      }

      const kbDir = path.join(workDir, 'knowledge-base');
      if (fs.existsSync(workDir) && !fs.existsSync(kbDir)) {
        try {
          initWorkspaceSkeleton(workDir, botName, botName, logger);
          logger.info({ botName }, 'Fixed: created missing knowledge-base directory');
          fixed++;
        } catch (err: any) {
          logger.warn({ botName, err: err.message }, 'Failed to create knowledge-base');
          warnings++;
        }
      }
    }

    checked++;
  }

  if (warnings > 0 || fixed > 0) {
    logger.info({ checked, warnings, fixed }, 'Bot consistency validation complete');
  } else {
    logger.info({ checked }, 'Bot consistency validation passed — all bots healthy');
  }
}
