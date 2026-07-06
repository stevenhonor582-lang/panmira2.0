import { randomBytes } from 'node:crypto';

/**
 * UUID v7 — 时间有序,适合主键
 * 格式:8-4-4-4-12 = 16 字节
 * - 前 6 字节:unix timestamp ms
 * - 第 7 字节:version (7 << 4) | random 4 bits
 * - 第 9 字节:variant (10xx) | random 6 bits
 */
export function uuidv7(): string {
  const ts = BigInt(Date.now());
  const rand = randomBytes(10);
  const bytes = new Uint8Array(16);
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  bytes[6] = (0x70) | (rand[0]! & 0x0f);
  bytes[7] = rand[1]!;
  bytes[8] = (0x80) | (rand[2]! & 0x3f);
  for (let i = 9; i < 16; i++) bytes[i] = rand[i - 6]!;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 短 ID(用于 device_code user_code 等需要人读的场景) */
export function shortCode(length = 8): string {
  return randomBytes(length).toString('base64url').slice(0, length);
}

/** Device user_code:大写字母数字,易读(去除 0/O/1/I 混淆) */
export function deviceUserCode(length = 8): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}
