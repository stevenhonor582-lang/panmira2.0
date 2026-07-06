import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  oauthAccessTokens,
  oauthRefreshTokens,
} from '../db/schema.ts';

const ACCESS_TTL_SEC = 60 * 60; // 1h
const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30d

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url'); // 43 字符
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface IssueParams {
  clientId: string;
  userId: string | null;
  tenantId: string;
  scopes: string[];
}

export interface IssueResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
}

export async function issueTokens(p: IssueParams): Promise<IssueResult> {
  const accessToken = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();
  const accessExpiresAt = new Date(Date.now() + ACCESS_TTL_SEC * 1000);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000);

  const [accessRow] = await db
    .insert(oauthAccessTokens)
    .values({
      tokenHash: hashToken(accessToken),
      clientId: p.clientId,
      userId: p.userId,
      tenantId: p.tenantId,
      scopes: p.scopes,
      expiresAt: accessExpiresAt,
    })
    .returning();
  if (!accessRow) throw new Error('Failed to issue access token');

  await db.insert(oauthRefreshTokens).values({
    tokenHash: hashToken(refreshToken),
    accessTokenId: accessRow.id,
    clientId: p.clientId,
    expiresAt: refreshExpiresAt,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TTL_SEC,
    scopes: p.scopes,
  };
}

export interface ValidateResult {
  valid: boolean;
  clientId?: string;
  userId?: string | null;
  tenantId?: string;
  scopes?: string[];
  tokenId?: string;
}

export async function validateAccessToken(token: string): Promise<ValidateResult> {
  const [row] = await db
    .select()
    .from(oauthAccessTokens)
    .where(
      and(
        eq(oauthAccessTokens.tokenHash, hashToken(token)),
        isNull(oauthAccessTokens.revokedAt),
        gt(oauthAccessTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) return { valid: false };
  return {
    valid: true,
    clientId: row.clientId,
    userId: row.userId,
    tenantId: row.tenantId,
    scopes: row.scopes as string[],
    tokenId: row.id,
  };
}

export async function rotateRefreshToken(
  oldRefreshToken: string,
  clientId: string,
): Promise<IssueResult> {
  const oldHash = hashToken(oldRefreshToken);
  const [oldRow] = await db
    .select()
    .from(oauthRefreshTokens)
    .where(
      and(
        eq(oauthRefreshTokens.tokenHash, oldHash),
        eq(oauthRefreshTokens.clientId, clientId),
        isNull(oauthRefreshTokens.revokedAt),
        gt(oauthRefreshTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!oldRow) throw new Error('invalid_grant: refresh token not found or revoked');

  // 撤销旧的(连带其 access token)
  await db
    .update(oauthRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthRefreshTokens.id, oldRow.id));
  await db
    .update(oauthAccessTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthAccessTokens.id, oldRow.accessTokenId));

  // 继承原 access token 的 user/tenant/scopes
  const [accessRow] = await db
    .select()
    .from(oauthAccessTokens)
    .where(eq(oauthAccessTokens.id, oldRow.accessTokenId))
    .limit(1);
  if (!accessRow) throw new Error('invalid_grant: original access token not found');

  return issueTokens({
    clientId: accessRow.clientId,
    userId: accessRow.userId,
    tenantId: accessRow.tenantId,
    scopes: accessRow.scopes as string[],
  });
}

export async function revokeAccessToken(token: string): Promise<void> {
  await db
    .update(oauthAccessTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthAccessTokens.tokenHash, hashToken(token)));
}
