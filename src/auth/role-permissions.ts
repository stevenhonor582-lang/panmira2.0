/**
 * Bot permission enforcement — role definitions and access control logic.
 */
import type { PermissionConfig, UserRole } from '../config.js';

/** Tools available to each role. */
export const ROLE_TOOLS: Record<UserRole, string[]> = {
  viewer: ['Read', 'Grep', 'Glob'],
  operator: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'Bash'],
  editor: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'Bash', 'Write', 'Edit'],
  admin: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'Bash', 'Write', 'Edit', 'NotebookEdit'],
};

/** Always-blocked Bash patterns — dangerous system commands. */
const ALWAYS_BLOCKED_PATTERNS = [
  { pattern: /\brm\s+-rf\s+\//, label: 'rm -rf /' },
  { pattern: /\bchmod\s+777\b/, label: 'chmod 777' },
  { pattern: /\bmkfs\b/, label: 'mkfs' },
  { pattern: /\bdd\s+if=/, label: 'dd' },
  { pattern: />\s*\/etc\//, label: 'write to /etc' },
  { pattern: /\bpm2\s+(restart|stop|delete|kill)\b/, label: 'pm2 process control' },
];

/** Protected paths that non-admin roles cannot write to. */
const PROTECTED_PATHS = [
  { prefix: '/home/ubuntu/panmira/src/', label: 'metabot source code' },
  { prefix: '/home/ubuntu/panmira/web/', label: 'metabot web code' },
  { prefix: '/home/ubuntu/.claude/skills/', label: 'Claude skills' },
  { prefix: '/home/ubuntu/.claude/CLAUDE.md', label: 'CLAUDE.md config' },
  { prefix: '/home/ubuntu/.claude/settings.json', label: 'settings.json' },
  { prefix: '/home/ubuntu/.claude/agents/', label: 'agent templates' },
  { prefix: '/etc/', label: 'system config' },
];

/**
 * Resolve which role applies to a given user for a bot.
 * Returns the effective role based on access control config.
 */
export function resolveUserRole(
  permissions: PermissionConfig | undefined,
  userId: string,
): UserRole {
  if (!permissions?.accessControl || permissions.accessControl.mode === 'all') {
    return permissions?.defaultRole ?? 'editor';
  }
  const user = permissions.accessControl.allowedUsers?.find((u) => u.userId === userId);
  return user?.role ?? permissions.defaultRole ?? 'viewer';
}

/**
 * Check whether a user is allowed to use this bot at all.
 * Returns true if mode is 'all' or if user is in the allowlist.
 */
export function isUserAllowed(
  permissions: PermissionConfig | undefined,
  userId: string,
): boolean {
  if (!permissions?.accessControl || permissions.accessControl.mode === 'all') return true;
  return permissions.accessControl.allowedUsers?.some((u) => u.userId === userId) ?? false;
}

/**
 * Create a PreToolUse hook function that blocks dangerous Bash commands
 * based on the bot's bashSafety config.
 */
export function createBashGuardHook(
  permissions: PermissionConfig | undefined,
): (input: Record<string, unknown>) => Promise<Record<string, unknown>> {
  const safety = permissions?.bashSafety ?? {};

  return async (input: Record<string, unknown>) => {
    const toolInput = (input.tool_input as Record<string, unknown>) || {};
    const cmd = String(toolInput.command || '');

    const blocked: string[] = [];

    // Always-blocked: dangerous system commands
    const permitted = safety.permittedCommands ?? [];
    for (const { pattern, label } of ALWAYS_BLOCKED_PATTERNS) {
      if (pattern.test(cmd) && !permitted.includes(label)) {
        blocked.push(label);
      }
    }

    // Config-toggled blocks
    if (safety.blockGitPush && /\bgit\s+push\b/.test(cmd)) {
      blocked.push('git push (disabled by policy)');
    }
    if (safety.blockPackageInstall && /\b(npm|pip|pip3|apt|apt-get|yum|pnpm|yarn)\s+(install|i|add)\b/.test(cmd)) {
      blocked.push('package install (disabled by policy)');
    }
    if (safety.blockNetworkOps && /\b(curl|wget|ssh|scp|nc|ncat|rsync)\b/.test(cmd)) {
      blocked.push('network operations (disabled by policy)');
    }

    if (blocked.length > 0) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Blocked by bot permission policy: ${blocked.join(', ')}`,
        },
      };
    }

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  };
}

/**
 * Create a PreToolUse hook function that blocks Write/Edit operations
 * on protected paths (system code, skills, config).
 */
export function createFSGuardHook(
  permissions: PermissionConfig | undefined,
  workspaceDir: string,
): (input: Record<string, unknown>) => Promise<Record<string, unknown>> {
  const fsPerms = permissions?.fileSystem ?? {};

  return async (input: Record<string, unknown>) => {
    const toolInput = (input.tool_input as Record<string, unknown>) || {};
    const filePath = String(toolInput.file_path || toolInput.path || '');

    if (!filePath) {
      // No file path — allow (e.g. Write with content but no path shouldn't happen normally)
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    const blocked: string[] = [];

    // Check system-protected paths
    if (fsPerms.protectSkills !== false) {
      for (const { prefix, label } of PROTECTED_PATHS) {
        if (filePath.startsWith(prefix)) {
          blocked.push(label);
          break;
        }
      }
    }

    // Allow writes to /tmp (always)
    if (filePath.startsWith('/tmp/')) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Block writes outside workspace (unless admin-exempt)
    const homeDir = process.env.HOME || '/home/ubuntu';
    const allowedPrefixes = [
      workspaceDir,
      `${homeDir}/workspace`,
      '/tmp/',
      `${homeDir}/.claude/projects/`, // session files that the SDK writes
    ];

    const isAllowedPath = allowedPrefixes.some((prefix) => filePath.startsWith(prefix));
    if (!isAllowedPath && filePath.startsWith('/')) {
      blocked.push(`outside workspace: ${filePath}`);
    }

    if (blocked.length > 0) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Write blocked: ${blocked.join(', ')}`,
        },
      };
    }

    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  };
}
