/**
 * SDK Core Feature Flag
 *
 * Controls which bots use SDK Core (QueryRunner) vs legacy executor.
 *
 * Two env var patterns supported:
 *   USE_SDK_CORE_BOTS=得一,玄鉴     (Chinese names, comma-separated)
 *   USE_SDK_CORE_<SLUG>=true         (English slug uppercased, e.g. USE_SDK_CORE_DEYI=true)
 *
 * @module sdk-core/feature-flag
 */

// English slug map (matches V021 bot_configs.english_slug)
const SLUG_MAP: Readonly<Record<string, string>> = Object.freeze({
  '得一': 'DEYI',
  '玄鉴': 'XUANJIAN',
  '不盈': 'BUYING',
  '守静': 'SHOUJING',
  '信言': 'XINYAN',
});

/**
 * Check if a bot should use SDK Core instead of legacy executor.
 */
export function useSDKCore(botName: string): boolean {
  // Check 1: Chinese name in BOTS list
  const botList = process.env.USE_SDK_CORE_BOTS;
  if (botList) {
    const bots = botList.split(',').map((b) => b.trim());
    if (bots.includes(botName)) return true;
  }

  // Check 2: English slug individual flag (USE_SDK_CORE_DEYI=true)
  const slug = SLUG_MAP[botName];
  if (slug && process.env[`USE_SDK_CORE_${slug}`] === 'true') {
    return true;
  }

  return false;
}
