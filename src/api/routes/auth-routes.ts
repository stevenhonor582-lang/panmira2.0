/**
 * Auth route handlers — register, login (2-step), refresh, me, user management.
 *
 * A1 改造 (2026-07-08):
 *   - /api/auth/login 保留(deprecated,自动走 step1+step2)
 *   - /api/auth/login/step1 — 账号密码 → 返回 verification_code (不返回 token)
 *   - /api/auth/login/step2 — verification_code → 完整 token
 *   - /api/auth/login/lockout — 查询当前账户锁定状态
 *   - /api/auth/users (POST) — admin 创建 operator/member
 *   - /api/auth/users/:id (PATCH) — admin/operator 修改 role / phone
 *   - role 升级为 admin | operator | member
 *   - 5 次失败 → locked_until 30min
 */
import type http from 'node:http';
import type { UserStore, User, UserRole, EmployeeStatus } from '../../db/user-store.js';
import { generateTokenPair, verifyAccessToken, verifyRefreshToken } from '../middleware.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import { canManageUser } from '../../middleware/rbac.js';

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW = 60_000;

const VALID_ROLES: ReadonlyArray<UserRole> = ['admin', 'operator', 'member'];
const VALID_EMPLOYEE_STATUS: ReadonlyArray<EmployeeStatus> = ['active', 'paused', 'departed', 'deleted'];

function stripQuery(u: string): string {
  const i = u.indexOf('?');
  return i >= 0 ? u.slice(0, i) : u;
}

export async function handleAuthRoutes(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  rawUrl: string,
): Promise<boolean> {
  const url = stripQuery(rawUrl);
  // A1: 2-step login
  if (url === '/api/auth/login/step1' && method === 'POST') {
    return handleLoginStep1(userStore, req, res);
  }
  if (url === '/api/auth/login/step2' && method === 'POST') {
    return handleLoginStep2(userStore, req, res);
  }
  if (url === '/api/auth/login/lockout' && method === 'GET') {
    return handleLoginLockout(userStore, req, res);
  }

  // 兼容旧端点(deprecated)
  if (url === '/api/auth/register' && method === 'POST') {
    return handleRegister(userStore, req, res);
  }
  if (url === '/api/auth/login' && method === 'POST') {
    return handleLoginLegacy(userStore, req, res);
  }
  if (url === '/api/auth/refresh' && method === 'POST') {
    return handleRefresh(userStore, req, res);
  }
  if (url === '/api/auth/me' && method === 'GET') {
    return handleMe(userStore, req, res);
  }
  if (url === '/api/auth/change-password' && method === 'POST') {
    return handleChangePassword(userStore, req, res);
  }
  // 列出用户 — admin only
  if (url === '/api/auth/users' && method === 'GET') {
    return handleListUsers(userStore, req, res);
  }
  // 创建用户 — admin only
  if (url === '/api/auth/users' && method === 'POST') {
    return handleCreateUser(userStore, req, res);
  }
  // 修改用户 — admin 全权 / operator 仅 member
  if (url.startsWith('/api/auth/users/') && (method === 'PUT' || method === 'PATCH')) {
    return handleUpdateUser(userStore, req, res, url);
  }
  if (url.match(/^\/api\/auth\/users\/[0-9a-f-]+\/reset-password$/) && method === 'POST') {
    return handleResetPassword(userStore, req, res, url);
  }
  if (url.match(/^\/api\/auth\/users\/[0-9a-f-]+\/activity$/) && method === 'GET') {
    return handleGetUserActivity(userStore, req, res, url);
  }
  if (url.startsWith('/api/auth/users/') && method === 'DELETE') {
    return handleDeleteUser(userStore, req, res, url);
  }
  return false;
}

// ----------------------------------------------------------------------------
// A1: 2-step login
// ----------------------------------------------------------------------------

async function handleLoginStep1(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const clientIp = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const attempt = loginAttempts.get(clientIp);
  if (attempt && now < attempt.resetAt && attempt.count >= LOGIN_RATE_LIMIT) {
    jsonResponse(res, 429, { error: 'rate_limited', message: 'Too many login attempts. Try again later.' });
    return true;
  }

  const body = await parseJsonBody(req);
  const email = (body as any).email;
  const password = (body as any).password;

  if (!email || !password) {
    jsonResponse(res, 400, { error: 'email and password are required' });
    return true;
  }

  try {
    const result = await userStore.beginLogin(email, password);
    loginAttempts.delete(clientIp);

    // 真实部署这里应该通过短信/邮件发 code。
    // 开发态: 直接回传 verification_code + expiresAt(便于测试)。
    // 生产环境可通过 PANMIRA_DEV_RETURN_CODE=true 关闭。
    const devReturn = process.env.PANMIRA_DEV_RETURN_CODE !== 'false';

    jsonResponse(res, 200, {
      success: true,
      user: sanitizeUser(result.user),
      // 开发态回传 code;生产关闭
      ...(devReturn ? { verificationCode: result.verificationCode, expiresAt: result.expiresAt.toISOString() } : {}),
      expiresInSeconds: 300,
      nextStep: 'POST /api/auth/login/step2 { email, verificationCode }',
    });
    return true;
  } catch (err: any) {
    const now = Date.now();
    const attempt = loginAttempts.get(clientIp);
    if (!attempt || now >= attempt.resetAt) {
      loginAttempts.set(clientIp, { count: 1, resetAt: now + LOGIN_RATE_WINDOW });
    } else {
      attempt.count++;
    }
    if (err.code === 'ACCOUNT_LOCKED') {
      jsonResponse(res, 423, { error: 'account_locked', message: err.message });
    } else {
      jsonResponse(res, 401, { error: 'invalid_credentials', message: err.message || 'Invalid email or password' });
    }
    return true;
  }
}

async function handleLoginStep2(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const body = await parseJsonBody(req);
  const email = (body as any).email;
  const code = (body as any).verificationCode || (body as any).code;

  if (!email || !code) {
    jsonResponse(res, 400, { error: 'email and verificationCode are required' });
    return true;
  }

  try {
    const user = await userStore.completeLogin(email, code);
    const tokens = await generateTokenPair(user);
    jsonResponse(res, 200, {
      user: sanitizeUser(user),
      ...tokens,
    });
    return true;
  } catch (err: any) {
    if (err.code === 'ACCOUNT_LOCKED') {
      jsonResponse(res, 423, { error: 'account_locked', message: err.message });
      return true;
    }
    // 错误码会被 completeLogin 内部计入失败次数,5 次自动锁
    jsonResponse(res, 401, { error: 'invalid_verification_code', message: err.message || 'Invalid code' });
    return true;
  }
}

async function handleLoginLockout(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const u = new URL(req.url ?? '', 'http://localhost');
  const email = u.searchParams.get('email');
  if (!email) {
    jsonResponse(res, 400, { error: 'email query param required' });
    return true;
  }
  const user = await userStore.findByEmail(email);
  if (!user) {
    jsonResponse(res, 200, { locked: false, exists: false });
    return true;
  }
  const now = new Date();
  const locked = !!(user.lockedUntil && user.lockedUntil > now);
  const remainingMinutes = locked && user.lockedUntil
    ? Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000)
    : 0;
  jsonResponse(res, 200, {
    exists: true,
    locked,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    remainingMinutes,
    failedAttempts: user.failedAttempts,
    isActive: user.isActive,
  });
  return true;
}

// ----------------------------------------------------------------------------
// Legacy endpoints (保留兼容,标 deprecated)
// ----------------------------------------------------------------------------

async function handleLoginLegacy(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', '2026-09-01');
  res.setHeader('Link', '</api/auth/login/step1>; rel="successor-version"');

  const body = await parseJsonBody(req);
  const email = (body as any).email;
  const password = (body as any).password;

  if (!email || !password) {
    jsonResponse(res, 400, { error: 'Email and password are required' });
    return true;
  }

  try {
    const user = await userStore.login(email, password);
    const tokens = await generateTokenPair(user);
    loginAttempts.delete(req.socket.remoteAddress || 'unknown');
    jsonResponse(res, 200, { user: sanitizeUser(user), ...tokens });
    return true;
  } catch {
    jsonResponse(res, 401, { error: 'Invalid email or password' });
    return true;
  }
}

async function handleRegister(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const hasUsers = !(await userStore.isEmpty());
  if (hasUsers) {
    const ctx = await authenticateAdmin(req, res);
    if (!ctx) return true;
  }

  const body = await parseJsonBody(req);
  const email = (body as any).email;
  const password = (body as any).password;
  const name = (body as any).name || email?.split('@')[0] || 'User';
  const phone = (body as any).phone;

  if (!email || !password) {
    jsonResponse(res, 400, { error: 'Email and password are required' });
    return true;
  }
  if (password.length < 6) {
    jsonResponse(res, 400, { error: 'Password must be at least 6 characters' });
    return true;
  }

  // 仅 admin 注册时允许指定 role
  const registerOpts: { phone?: string; role?: UserRole } = { phone };
  if (hasUsers && (body as any).role) {
    const r = (body as any).role as UserRole;
    if (!VALID_ROLES.includes(r)) {
      jsonResponse(res, 400, { error: `role must be one of ${VALID_ROLES.join(', ')}` });
      return true;
    }
    registerOpts.role = r;
  }

  const user = await userStore.register(email, password, name, registerOpts);

  if (hasUsers) {
    jsonResponse(res, 201, { user: sanitizeUser(user) });
  } else {
    const tokens = await generateTokenPair(user);
    jsonResponse(res, 201, { user: sanitizeUser(user), ...tokens });
  }
  return true;
}

async function handleRefresh(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const body = await parseJsonBody(req);
  const refreshToken = (body as any).refreshToken;

  if (!refreshToken) {
    jsonResponse(res, 400, { error: 'Refresh token required' });
    return true;
  }

  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) {
    jsonResponse(res, 401, { error: 'Invalid or expired refresh token' });
    return true;
  }

  const user = await userStore.findById(payload.sub);
  if (!user || !user.isActive) {
    jsonResponse(res, 401, { error: 'User not found or inactive' });
    return true;
  }

  const tokens = await generateTokenPair(user);
  jsonResponse(res, 200, tokens);
  return true;
}

async function handleMe(userStore: UserStore, req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
  const ctx = await authenticate(req, res);
  if (!ctx) return true;

  const user = await userStore.findById(ctx.sub);
  if (!user) {
    jsonResponse(res, 404, { error: 'User not found' });
    return true;
  }

  jsonResponse(res, 200, sanitizeUser(user));
  return true;
}

async function handleChangePassword(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const ctx = await authenticate(req, res);
  if (!ctx) return true;

  const body = await parseJsonBody(req);
  const oldPassword = (body as any).oldPassword || '';
  const newPassword = (body as any).newPassword;
  const userId = (body as any).userId || ctx.sub;

  if (!newPassword) {
    jsonResponse(res, 400, { error: 'newPassword is required' });
    return true;
  }
  if (newPassword.length < 6) {
    jsonResponse(res, 400, { error: 'New password must be at least 6 characters' });
    return true;
  }

  const caller = await userStore.findById(ctx.sub);
  if (!caller) {
    jsonResponse(res, 401, { error: 'User not found' });
    return true;
  }

  if (userId !== ctx.sub) {
    // 修改别人密码 — admin / operator(且目标不是 admin)
    if (!canManageUser(caller.role, caller.id, (await userStore.findById(userId))?.role ?? 'member', userId)) {
      jsonResponse(res, 403, { error: 'forbidden', message: 'cannot manage this user' });
      return true;
    }
    await userStore.resetPassword(userId, newPassword);
    jsonResponse(res, 200, { success: true });
  } else if (caller.role === 'admin' && !oldPassword) {
    await userStore.resetPassword(ctx.sub, newPassword);
    jsonResponse(res, 200, { success: true });
  } else {
    try {
      await userStore.changePassword(ctx.sub, oldPassword, newPassword);
      jsonResponse(res, 200, { success: true });
    } catch (err: any) {
      jsonResponse(res, 400, { error: err.message });
    }
  }
  return true;
}

// ----------------------------------------------------------------------------
// User CRUD (admin / operator 管理)
// ----------------------------------------------------------------------------

async function handleListUsers(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const ctx = await authenticate(req, res);
  if (!ctx) return true;
  // P9 RBAC (2026-07-08): 提升到 admin only,operator 改 403
  if (ctx.role !== 'admin') {
    jsonResponse(res, 403, { error: 'forbidden', message: '需要 admin (P9 RBAC)' });
    return true;
  }
  // R11: 支持 ?status=active|paused|departed|deleted 过滤
  const u = new URL(req.url ?? '', 'http://localhost');
  const statusParam = u.searchParams.get('status') as EmployeeStatus | null;
  const status = statusParam && VALID_EMPLOYEE_STATUS.includes(statusParam) ? statusParam : undefined;
  const users = await userStore.list(status);
  jsonResponse(res, 200, { users: users.map(sanitizeUser) });
  return true;
}

async function handleCreateUser(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const ctx = await authenticate(req, res);
  if (!ctx) return true;
  // admin 可创建任何角色;operator 只能创建 member
  if (ctx.role !== 'admin' && ctx.role !== 'operator') {
    jsonResponse(res, 403, { error: 'forbidden', message: '需要 admin 或 operator 角色' });
    return true;
  }
  const body = await parseJsonBody(req);
  const email = (body as any).email;
  // R11: password 可选 (后端生成默认密码, 如通知模式选"邮件验证码")
  const password = (body as any).password || `Pan-${Math.random().toString(36).slice(2, 10)}`;
  const name = (body as any).name;
  const phone = (body as any).phone;
  const role = (body as any).role ?? 'member';
  const department = (body as any).department;
  const position = (body as any).position;
  const employeeStatus = (body as any).employeeStatus ?? 'active';
  const agentIds: string[] = Array.isArray((body as any).agentIds) ? (body as any).agentIds : [];
  const pipelineIds: string[] = Array.isArray((body as any).pipelineIds) ? (body as any).pipelineIds : [];

  if (!email || !name) {
    jsonResponse(res, 400, { error: 'email, name are required' });
    return true;
  }
  if (password.length < 6) {
    jsonResponse(res, 400, { error: 'Password must be at least 6 characters' });
    return true;
  }
  if (!VALID_ROLES.includes(role)) {
    jsonResponse(res, 400, { error: `role must be one of ${VALID_ROLES.join(', ')}` });
    return true;
  }
  if (!VALID_EMPLOYEE_STATUS.includes(employeeStatus)) {
    jsonResponse(res, 400, { error: `employeeStatus must be one of ${VALID_EMPLOYEE_STATUS.join(', ')}` });
    return true;
  }
  if (role === 'admin' && ctx.role !== 'admin') {
    jsonResponse(res, 403, { error: 'forbidden', message: '只有 admin 能创建 admin 账户' });
    return true;
  }
  if (role === 'operator' && ctx.role !== 'admin') {
    jsonResponse(res, 403, { error: 'forbidden', message: '只有 admin 能创建 operator 账户' });
    return true;
  }

  try {
    const user = await userStore.register(email, password, name, {
      phone, role, department, position, employeeStatus,
    });
    // R11: 分配数字员工和流水线
    if (agentIds.length > 0) await userStore.assignAgents(user.id, agentIds);
    if (pipelineIds.length > 0) await userStore.assignPipelines(user.id, pipelineIds);
    jsonResponse(res, 201, { user: sanitizeUser(user), generatedPassword: (body as any).password ? undefined : password });
  } catch (err: any) {
    jsonResponse(res, 400, { error: err.message });
  }
  return true;
}

async function handleUpdateUser(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
): Promise<boolean> {
  const ctx = await authenticate(req, res);
  if (!ctx) return true;

  const match = url.match(/^\/api\/auth\/users\/([0-9a-f-]+)$/);
  if (!match) return false;
  const userId = match[1];
  const target = await userStore.findById(userId);
  if (!target) {
    jsonResponse(res, 404, { error: 'User not found' });
    return true;
  }

  // 业务规则:谁能改谁
  if (!canManageUser(ctx.role, ctx.sub, target.role, target.id)) {
    jsonResponse(res, 403, {
      error: 'forbidden',
      message: `${ctx.role} cannot manage ${target.role}`,
    });
    return true;
  }

  const body = await parseJsonBody(req);

  // PATCH 直接更新字段
  if (req.method === 'PATCH') {
    let updated = target;
    if ((body as any).role !== undefined) {
      const newRole = (body as any).role as UserRole;
      if (!VALID_ROLES.includes(newRole)) {
        jsonResponse(res, 400, { error: `role must be one of ${VALID_ROLES.join(', ')}` });
        return true;
      }
      // operator 不能把 member 提到 admin
      if (ctx.role !== 'admin' && newRole === 'admin') {
        jsonResponse(res, 403, { error: 'forbidden', message: '只有 admin 能设置 admin role' });
        return true;
      }
      await userStore.updateRole(userId, newRole);
      updated = (await userStore.findById(userId))!;
    }
    if ((body as any).phone !== undefined) {
      await userStore.updatePhone(userId, (body as any).phone || null);
      updated = (await userStore.findById(userId))!;
    }
    if ((body as any).isActive !== undefined) {
      await userStore.setActive(userId, !!(body as any).isActive);
      updated = (await userStore.findById(userId))!;
    }
    // R11: 雇佣状态 (active/paused/departed)
    if ((body as any).employeeStatus !== undefined) {
      const newStatus = (body as any).employeeStatus as EmployeeStatus;
      if (!VALID_EMPLOYEE_STATUS.includes(newStatus)) {
        jsonResponse(res, 400, { error: `employeeStatus must be one of ${VALID_EMPLOYEE_STATUS.join(', ')}` });
        return true;
      }
      await userStore.updateEmployeeStatus(userId, newStatus);
      // 离职自动禁用登录 (但 is_active 字段保留语义独立)
      if (newStatus === 'departed') {
        await userStore.setActive(userId, false);
      }
      updated = (await userStore.findById(userId))!;
    }
    // R11: 部门 / 职位
    if ((body as any).department !== undefined) {
      await userStore.updateDepartment(userId, (body as any).department || null);
      updated = (await userStore.findById(userId))!;
    }
    if ((body as any).position !== undefined) {
      await userStore.updatePosition(userId, (body as any).position || null);
      updated = (await userStore.findById(userId))!;
    }
    if ((body as any).unlock === true) {
      await userStore.unlock(userId);
      updated = (await userStore.findById(userId))!;
    }
    jsonResponse(res, 200, { user: sanitizeUser(updated) });
    return true;
  }

  // PUT 兼容老 action 协议
  const { action } = body as { action?: string };
  if (action === 'toggleRole') {
    const newRole = target.role === 'admin' ? 'member' : 'admin';
    if (newRole === 'admin' && ctx.role !== 'admin') {
      jsonResponse(res, 403, { error: 'forbidden', message: '只有 admin 能升级到 admin' });
      return true;
    }
    await userStore.updateRole(userId, newRole);
    const updated = await userStore.findById(userId);
    jsonResponse(res, 200, { user: sanitizeUser(updated!) });
  } else if (action === 'toggleActive') {
    await userStore.setActive(userId, !target.isActive);
    const updated = await userStore.findById(userId);
    jsonResponse(res, 200, { user: sanitizeUser(updated!) });
  } else {
    jsonResponse(res, 400, { error: 'Unknown action. Use PATCH { role, phone, isActive, unlock } or PUT action={toggleRole|toggleActive}' });
  }
  return true;
}

async function handleDeleteUser(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
): Promise<boolean> {
  const ctx = await authenticate(req, res);
  if (!ctx) return true;

  const match = url.match(/^\/api\/auth\/users\/([0-9a-f-]+)$/);
  if (!match) return false;
  const userId = match[1];

  if (userId === ctx.sub) {
    jsonResponse(res, 400, { error: 'cannot_delete_self' });
    return true;
  }

  const target = await userStore.findById(userId);
  if (!target) {
    jsonResponse(res, 404, { error: 'User not found' });
    return true;
  }
  if (!canManageUser(ctx.role, ctx.sub, target.role, target.id)) {
    jsonResponse(res, 403, {
      error: 'forbidden',
      message: `${ctx.role} cannot delete ${target.role}`,
    });
    return true;
  }

  // R11: 仅离职员工可彻底删除
  if (target.employeeStatus !== 'departed') {
    jsonResponse(res, 400, {
      error: 'not_departed',
      message: '仅 employeeStatus=departed 的员工可彻底删除,请先标记离职',
    });
    return true;
  }

  try {
    const ok = await userStore.delete(userId);
    if (!ok) {
      jsonResponse(res, 404, { error: 'User not found' });
      return true;
    }
    jsonResponse(res, 200, { ok: true });
  } catch (err: any) {
    jsonResponse(res, 400, { error: err.message });
  }
  return true;
}

// R11: 单独 reset-password 端点 (RBAC: admin 全权 / operator 仅 member)
async function handleResetPassword(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
): Promise<boolean> {
  const ctx = await authenticate(req, res);
  if (!ctx) return true;

  const match = url.match(/^\/api\/auth\/users\/([0-9a-f-]+)\/reset-password$/);
  if (!match) return false;
  const userId = match[1];
  const target = await userStore.findById(userId);
  if (!target) {
    jsonResponse(res, 404, { error: 'User not found' });
    return true;
  }
  if (!canManageUser(ctx.role, ctx.sub, target.role, target.id)) {
    jsonResponse(res, 403, { error: 'forbidden', message: `${ctx.role} cannot manage ${target.role}` });
    return true;
  }
  const body = await parseJsonBody(req);
  const newPassword = (body as any).newPassword || (body as any).password;
  if (!newPassword || newPassword.length < 6) {
    jsonResponse(res, 400, { error: 'newPassword 必填且至少 6 位' });
    return true;
  }
  await userStore.resetPassword(userId, newPassword);
  jsonResponse(res, 200, { success: true });
  return true;
}

// R11: 拉员工活动统计 (24h 调用 / 数字员工数 / 任务数)
async function handleGetUserActivity(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
): Promise<boolean> {
  const ctx = await authenticate(req, res);
  if (!ctx) return true;
  const match = url.match(/^\/api\/auth\/users\/([0-9a-f-]+)\/activity$/);
  if (!match) return false;
  const userId = match[1];
  const target = await userStore.findById(userId);
  if (!target) {
    jsonResponse(res, 404, { error: 'User not found' });
    return true;
  }
  const [agents, pipelines, calls24h] = await Promise.all([
    userStore.countAgents(userId),
    userStore.countPipelines(userId),
    userStore.countActivity24h(userId),
  ]);
  jsonResponse(res, 200, {
    agents,
    pipelines,
    calls24h,
  });
  return true;
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function sanitizeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    avatarUrl: user.avatarUrl,
    tenantId: user.tenantId,
    sid: user.sid,
    phone: user.phone,
    failedAttempts: user.failedAttempts,
    lockedUntil: user.lockedUntil,
    // R11 新字段
    department: user.department,
    position: user.position,
    employeeStatus: user.employeeStatus,
  };
}

async function authenticate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<{ sub: string; role: string; email: string | null } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    jsonResponse(res, 401, { error: 'unauthenticated', message: 'Missing token' });
    return null;
  }
  const payload = await verifyAccessToken(auth.slice(7));
  if (!payload) {
    jsonResponse(res, 401, { error: 'invalid_token', message: 'Invalid or expired token' });
    return null;
  }
  return { sub: payload.sub, role: payload.role, email: payload.email };
}

async function authenticateAdmin(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<{ sub: string; role: string } | null> {
  const ctx = await authenticate(req, res);
  if (!ctx) return null;
  if (ctx.role !== 'admin') {
    jsonResponse(res, 403, { error: 'forbidden', message: 'Admin role required' });
    return null;
  }
  return ctx;
}
