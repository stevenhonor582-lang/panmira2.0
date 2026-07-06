/**
 * Re-export 包装:统一 lib/crypto 入口
 * 实际实现在 src/db/crypto.ts(早期就有,AES-256-GCM)
 * 为新模块(OAuth / Token / Secret)提供 lib/ 路径
 */
export { encrypt, decrypt } from '../db/crypto.js';
