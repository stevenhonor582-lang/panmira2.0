/**
 * Auth route handlers — register, login, refresh, me.
 */
import type http from 'node:http';
import type { UserStore, User } from '../../db/user-store.js';
import { generateTokenPair, verifyAccessToken, verifyRefreshToken } from '../middleware.js';
import { jsonResponse, parseJsonBody } from './helpers.js';

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_LIMIT = 5;
const LOGIN_RATE_WINDOW = 60_000;

export async function handleAuthRoutes(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (url === '/api/auth/register' && method === 'POST') {
    return handleRegister(userStore, req, res);
  }
  if (url === '/api/auth/login' && method === 'POST') {
    return handleLogin(userStore, req, res);
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
  if (url === '/api/auth/users' && method === 'GET') {
    return handleListUsers(userStore, req, res);
  }
  if (url.startsWith('/api/auth/users/') && method === 'PUT') {
    return handleUpdateUser(userStore, req, res, url);
  }
  if (url.startsWith('/api/auth/users/') && method === 'DELETE') {
    return handleDeleteUser(userStore, req, res, url);
  }
  return false;
}

async function handleRegister(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  // If users already exist, require admin auth
  const hasUsers = !(await userStore.isEmpty());
  if (hasUsers) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      jsonResponse(res, 401, { error: 'Admin authorization required' });
      return true;
    }
    const payload = await verifyAccessToken(auth.slice(7));
    if (!payload) {
      jsonResponse(res, 401, { error: 'Invalid or expired token' });
      return true;
    }
    const caller = await userStore.findById(payload.sub);
    if (!caller || caller.role !== 'admin') {
      jsonResponse(res, 403, { error: 'Admin role required' });
      return true;
    }
  }

  const body = await parseJsonBody(req);
  const email = (body as any).email;
  const password = (body as any).password;
  const name = (body as any).name || email?.split('@')[0] || 'User';

  if (!email || !password) {
    jsonResponse(res, 400, { error: 'Email and password are required' });
    return true;
  }
  if (password.length < 6) {
    jsonResponse(res, 400, { error: 'Password must be at least 6 characters' });
    return true;
  }

  const user = await userStore.register(email, password, name);

  if (hasUsers) {
    jsonResponse(res, 201, { user: sanitizeUser(user) });
  } else {
    const tokens = await generateTokenPair(user);
    jsonResponse(res, 201, { user: sanitizeUser(user), ...tokens });
  }
  return true;
}

async function handleLogin(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const clientIp = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const attempt = loginAttempts.get(clientIp);
  if (attempt && now < attempt.resetAt && attempt.count >= LOGIN_RATE_LIMIT) {
    jsonResponse(res, 429, { error: 'Too many login attempts. Try again later.' });
    return true;
  }

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

    loginAttempts.delete(clientIp);
    jsonResponse(res, 200, {
      user: sanitizeUser(user),
      ...tokens,
    });
    return true;
  } catch {
    const now = Date.now();
    const attempt = loginAttempts.get(clientIp);
    if (!attempt || now >= attempt.resetAt) {
      loginAttempts.set(clientIp, { count: 1, resetAt: now + LOGIN_RATE_WINDOW });
    } else {
      attempt.count++;
    }
    jsonResponse(res, 401, { error: 'Invalid email or password' });
    return true;
  }
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
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    jsonResponse(res, 401, { error: 'Missing token' });
    return true;
  }

  const payload = await verifyAccessToken(auth.slice(7));
  if (!payload) {
    jsonResponse(res, 401, { error: 'Invalid or expired token' });
    return true;
  }

  const user = await userStore.findById(payload.sub);
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
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    jsonResponse(res, 401, { error: 'Missing token' });
    return true;
  }

  const payload = await verifyAccessToken(auth.slice(7));
  if (!payload) {
    jsonResponse(res, 401, { error: 'Invalid or expired token' });
    return true;
  }

  const body = await parseJsonBody(req);
  const oldPassword = (body as any).oldPassword || '';
  const newPassword = (body as any).newPassword;
  const userId = (body as any).userId || payload.sub;

  if (!newPassword) {
    jsonResponse(res, 400, { error: 'newPassword is required' });
    return true;
  }
  if (newPassword.length < 6) {
    jsonResponse(res, 400, { error: 'New password must be at least 6 characters' });
    return true;
  }

  // Admin can reset any user's password without oldPassword
  const caller = await userStore.findById(payload.sub);
  if (!caller) {
    jsonResponse(res, 401, { error: 'User not found' });
    return true;
  }

  if (userId !== payload.sub) {
    // Changing another user's password — admin only
    if (caller.role !== 'admin') {
      jsonResponse(res, 403, { error: 'Admin role required' });
      return true;
    }
    await userStore.resetPassword(userId, newPassword);
    jsonResponse(res, 200, { success: true });
  } else if (caller.role === 'admin' && !oldPassword) {
    // Admin changing own password without old password
    await userStore.resetPassword(payload.sub, newPassword);
    jsonResponse(res, 200, { success: true });
  } else {
    try {
      await userStore.changePassword(payload.sub, oldPassword, newPassword);
      jsonResponse(res, 200, { success: true });
    } catch (err: any) {
      jsonResponse(res, 400, { error: err.message });
    }
  }
  return true;
}

function sanitizeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    avatarUrl: user.avatarUrl,
    tenantId: user.tenantId,
  };
}

async function handleListUsers(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<boolean> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    jsonResponse(res, 401, { error: 'Missing token' });
    return true;
  }
  const payload = await verifyAccessToken(auth.slice(7));
  if (!payload) {
    jsonResponse(res, 401, { error: 'Invalid or expired token' });
    return true;
  }
  const caller = await userStore.findById(payload.sub);
  if (!caller || caller.role !== 'admin') {
    jsonResponse(res, 403, { error: 'Admin role required' });
    return true;
  }
  const users = await userStore.list();
  jsonResponse(res, 200, { users: users.map(sanitizeUser) });
  return true;
}

async function handleUpdateUser(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
): Promise<boolean> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    jsonResponse(res, 401, { error: 'Missing token' });
    return true;
  }
  const payload = await verifyAccessToken(auth.slice(7));
  if (!payload) {
    jsonResponse(res, 401, { error: 'Invalid or expired token' });
    return true;
  }
  const caller = await userStore.findById(payload.sub);
  if (!caller || caller.role !== 'admin') {
    jsonResponse(res, 403, { error: 'Admin role required' });
    return true;
  }

  const match = url.match(/^\/api\/auth\/users\/([0-9a-f-]+)$/);
  if (!match) {
    return false;
  }
  const userId = match[1];
  const body = await parseJsonBody(req);
  const { action } = body as { action?: string };

  if (action === 'toggleRole') {
    const user = await userStore.findById(userId);
    if (!user) {
      jsonResponse(res, 404, { error: 'User not found' });
      return true;
    }
    const newRole = user.role === 'admin' ? ('member' as const) : ('admin' as const);
    await userStore.updateRole(userId, newRole);
    const updated = await userStore.findById(userId);
    jsonResponse(res, 200, { user: sanitizeUser(updated!) });
  } else if (action === 'toggleActive') {
    const user = await userStore.findById(userId);
    if (!user) {
      jsonResponse(res, 404, { error: 'User not found' });
      return true;
    }
    await userStore.setActive(userId, !user.isActive);
    const updated = await userStore.findById(userId);
    jsonResponse(res, 200, { user: sanitizeUser(updated!) });
  } else {
    jsonResponse(res, 400, { error: 'Unknown action. Use toggleRole or toggleActive' });
  }
  return true;
}

async function handleDeleteUser(
  userStore: UserStore,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
): Promise<boolean> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    jsonResponse(res, 401, { error: 'Missing token' });
    return true;
  }
  const payload = await verifyAccessToken(auth.slice(7));
  if (!payload) {
    jsonResponse(res, 401, { error: 'Invalid or expired token' });
    return true;
  }
  const caller = await userStore.findById(payload.sub);
  if (!caller || caller.role !== 'admin') {
    jsonResponse(res, 403, { error: 'Admin role required' });
    return true;
  }

  const match = url.match(/^\/api\/auth\/users\/([0-9a-f-]+)$/);
  if (!match) return false;
  const userId = match[1];

  if (userId === payload.sub) {
    jsonResponse(res, 400, { error: 'Cannot delete yourself' });
    return true;
  }

  const ok = await userStore.delete(userId);
  if (!ok) {
    jsonResponse(res, 404, { error: 'User not found' });
    return true;
  }
  jsonResponse(res, 200, { ok: true });
  return true;
}
