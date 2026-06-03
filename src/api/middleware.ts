/**
 * JWT authentication middleware — token generation and verification.
 */
import { jwtVerify, SignJWT } from 'jose';
import type { User } from '../db/user-store.js';

if (!process.env.JWT_SECRET) {
  // Use process.stderr for startup errors before logger is available
  process.stderr.write('[AUTH] FATAL: JWT_SECRET environment variable is required\n');
  process.exit(1);
}
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const ACCESS_TTL = '90d';
const REFRESH_TTL = '180d';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JwtPayload {
  sub: string;
  email: string | null;
  role: string;
  tenantId: string;
}

export async function generateTokenPair(user: User): Promise<TokenPair> {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
  };

  const accessToken = await new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(JWT_SECRET);

  const refreshToken = await new SignJWT({ sub: user.id } as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(JWT_SECRET);

  return { accessToken, refreshToken };
}

export async function verifyAccessToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      sub: payload.sub as string,
      email: (payload.email as string) || null,
      role: payload.role as string,
      tenantId: payload.tenantId as string,
    };
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { sub: payload.sub as string };
  } catch {
    return null;
  }
}
