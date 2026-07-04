/**
 * SDK Core Feature Flag
 *
 * Controls which bots use SDK Core (QueryRunner) vs legacy executor.
 * Per-bot rollout: enable one bot at a time for safe migration.
 *
 * Usage:
 *   USE_SDK_CORE_BOTS=得一,玄鉴  (env var, comma-separated bot names)
 *   or individual: USE_SDK_CORE_DEYI=true
 *
 * @module sdk-core/feature-flag
 */

const LOG = console; // Minimal logger for flag module (avoid circular dep)

/**
 * Check if a bot should use SDK Core (QueryRunner) instead of legacy executor.
 *
 * @param botName - Bot Chinese name
 * @returns true if SDK Core enabled for this bot
 */
export function useSDKCore(botName: string): boolean {
  // Check individual env var first: USE_SDK_CORE_DEYI=true
  const individualKey = `USE_SDK_CORE_${botName.toUpperCase()}`;
  if (process.env[individualKey] === 'true') {
    return true;
  }

  // Check comma-separated list: USE_SDK_CORE_BOTS=得一,玄鉴
  const botList = process.env.USE_SDK_CORE_BOTS;
  if (botList) {
    const bots = botList.split(',').map((b) => b.trim());
    if (bots.includes(botName)) {
      return true;
    }
  }

  return false;
}
