/**
 * A1 RBAC middleware (2026-07-08)
 *
 * 三级 role 体系:
 *   admin    — 全部权限,可管理其他 admin
 *   operator — 可管理普通用户,不能改 admin,不能删 admin
 *   member   — 只读自己的资源
 *
 * 设计:
 *   - requireRole(minRole): HTTP middleware,403 if 不够
 *   - canManageUser(actor, target): 业务规则 helper
 *   - 跟现有 OAuth scope 体系共存:operator 默认有 agent:read, knowledge:read, reports:read
 *     admin 默认有 '*'(通配),member 维持原样(只读自己的)
 */
import type * as http from 'node:http';
import { verifyAccessToken } from '../api/middleware.js';
import { jsonResponse } from '../api/routes/helpers.js';

export type UserRole = 'admin' | 'operator' | 'member';

const ROLE_RANK: Record<UserRole, number> = {
  member: 1,
  operator: 2,
  admin: 3,
};

export function hasRoleAtLeast(role: string, minRole: UserRole): boolean {
  const r = role as UserRole;
  if (!(r in ROLE_RANK)) return false;
  return ROLE_RANK[r] >= ROLE_RANK[minRole];
}

export function isAdmin(role: string): boolean {
  return role === 'admin';
}

export function isOperatorOrAbove(role: string): boolean {
  return role === 'admin' || role === 'operator';
}

/**
 * 业务规则:actor 是否能管理 target
 *   - actor=admin: 可以管理任何人(包括降级其他 admin)
 *   - actor=operator: 可以管理 member,不能动 admin / 另一个 operator
 *   - actor=member: 只能管理自己
 */
export function canManageUser(
  actorRole: string,
  actorId: string,
  targetRole: string,
  targetId: string,
): boolean {
  if (actorId === targetId) return true; // 总是能管理自己
  if (actorRole === 'admin') return true;
  if (actorRole === 'operator') {
    return targetRole === 'member';
  }
  return false;
}

/**
 * HTTP middleware: 401 if no token, 403 if role insufficient
 */
export function requireRole(minRole: UserRole) {
  return async (req: http.IncomingMessage, res: http.ServerResponse): Promise<{ sub: string; role: string; email: string | null } | null> => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      jsonResponse(res, 401, { error: 'unauthenticated', message: '需要 Bearer token' });
      return null;
    }
    const token = auth.slice(7);
    const payload = await verifyAccessToken(token);
    if (!payload) {
      jsonResponse(res, 401, { error: 'invalid_token', message: 'token 无效或过期' });
      return null;
    }
    if (!hasRoleAtLeast(payload.role, minRole)) {
      jsonResponse(res, 403, {
        error: 'forbidden',
        message: `需要 role >= ${minRole} (当前: ${payload.role})`,
      });
      return null;
    }
    return { sub: payload.sub, role: payload.role, email: payload.email };
  };
}

/**
 * HTTP middleware: 验证 admin 角色(向后兼容老 requireAdmin 调用)
 */
export const requireAdmin = requireRole('admin');

/**
 * HTTP middleware: 验证 operator 或更高
 */
export const requireOperator = requireRole('operator');
