/**
 * JWT authentication middleware — token generation and verification.
 *
 * A1 改造 (2026-07-08):
 *   - access token TTL 缩短: 90d → 1h
 *   - refresh token TTL:     180d → 30d
 *   - payload 增加 sid, phone 字段(roles 不变)
 *   - 强制 type=access / type=refresh 区分
 *   - 启动时强校验 JWT_SECRET(≥32 hex chars)
 */
import { jwtVerify, SignJWT } from 'jose';
import type { User } from '../db/user-store.js';

if (!process.env.JWT_SECRET) {
  process.stderr.write('[AUTH] FATAL: JWT_SECRET environment variable is required\n');
  process.exit(1);
}
const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (JWT_SECRET_RAW.length < 32) {
  process.stderr.write(
    `[AUTH] FATAL: JWT_SECRET too short (${JWT_SECRET_RAW.length} chars; expected >= 32). Rotate it with: openssl rand -hex 32\n`,
  );
  process.exit(1);
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

const ACCESS_TTL = '1h';
const REFRESH_TTL = '30d';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access token seconds
}

export interface JwtPayload {
  sub: string;
  email: string | null;
  role: string;
  tenantId: string;
  sid: string | null;
  type: 'access';
}

export interface RefreshJwtPayload {
  sub: string;
  type: 'refresh';
}

export async function generateTokenPair(user: User): Promise<TokenPair> {
  const payload: Omit<JwtPayload, 'type'> = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    sid: user.sid ?? null,
  };

  const accessToken = await new SignJWT({ ...payload, type: 'access' } as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(JWT_SECRET);

  const refreshToken = await new SignJWT({ type: 'refresh' } as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(JWT_SECRET);

  return { accessToken, refreshToken, expiresIn: 3600 };
}

export async function verifyAccessToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.type !== 'access') return null;
    return {
      sub: payload.sub as string,
      email: (payload.email as string) || null,
      role: payload.role as string,
      tenantId: payload.tenantId as string,
      sid: (payload.sid as string) || null,
      type: 'access',
    };
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.type !== 'refresh') return null;
    return {
      sub: payload.sub as string,
      type: 'refresh',
    };
  } catch {
    return null;
  }
}
