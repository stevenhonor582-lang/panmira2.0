/**
 * User store — registration, login, user management via PostgreSQL.
 *
 * A1 改造 (2026-07-08):
 *   - role 扩展为 admin | operator | member
 *   - 加 phone / sid / verification_code / code_expires_at / failed_attempts / locked_until
 *   - 注册时自动派生 sid = 'metmira:<handle>'
 *   - login 失败计数 + 锁定(5 次失败 → 30min 锁)
 *   - login step1 颁发 verification_code,5 分钟过期
 *   - login step2 校验 verification_code 后返回完整 token
 */
import { pool } from './index.js';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'node:crypto';

export type UserRole = 'admin' | 'operator' | 'member';

export interface User {
  id: string;
  tenantId: string;
  email: string | null;
  name: string;
  role: UserRole;
  isActive: boolean;
  avatarUrl: string | null;
  feishuUserId: string | null;
  sid: string | null;
  phone: string | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SALT_ROUNDS = 12;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 30;
const VERIFICATION_CODE_TTL_SECONDS = 300;

function deriveSid(email: string | null, name: string, existingSids: Set<string>): string {
  let base: string;
  if (email && email !== '') {
    base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  } else {
    base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  if (!base) base = 'user';

  let candidate = `metmira:${base}`;
  let suffix = 0;
  while (existingSids.has(candidate)) {
    suffix += 1;
    candidate = `metmira:${base}-${suffix}`;
  }
  existingSids.add(candidate);
  return candidate;
}

function generateVerificationCode(): string {
  // 6 位数字
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export class UserStore {
  async register(email: string, password: string, displayName: string, opts?: { phone?: string; role?: UserRole }): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) throw new Error('Email already registered');

    const isFirst = await this.isEmpty();
    // 第一个用户强制 admin,其他默认为 member(operator 由 admin 后续提升)
    const role: UserRole = (isFirst ? 'admin' : (opts?.role ?? 'member'));

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    let tenantId: string;
    if (isFirst) {
      const tenantResult = await pool.query('INSERT INTO tenants (name) VALUES ($1) RETURNING id', ['Default']);
      tenantId = tenantResult.rows[0].id;
    } else {
      const defaultTenant = await pool.query('SELECT id FROM tenants LIMIT 1');
      tenantId = defaultTenant.rows[0].id;
    }

    const sidResult = await pool.query('SELECT sid FROM users');
    const existingSids = new Set<string>(sidResult.rows.map((r: any) => r.sid));
    const sid = deriveSid(email, displayName, existingSids);

    const result = await pool.query(
      `INSERT INTO users (tenant_id, email, name, role, password_hash, sid, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [tenantId, email, displayName, role, passwordHash, sid, opts?.phone ?? null],
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * A1 step1: 验证账号密码,颁发 verification_code,5 分钟过期
   * 不返回 token。
   */
  async beginLogin(email: string, password: string): Promise<{ user: User; verificationCode: string; expiresAt: Date }> {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }
    const row = result.rows[0];

    // 锁定检查
    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 60000);
      throw Object.assign(new Error(`Account locked. Try again in ${mins} minutes.`), { code: 'ACCOUNT_LOCKED' });
    }
    if (!row.is_active) {
      throw new Error('Account is inactive');
    }
    if (!row.password_hash) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      await this.recordFailedAttempt(row.id);
      throw new Error('Invalid credentials');
    }

    // 密码正确 → 重置失败计数,生成 verification_code
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_SECONDS * 1000);

    await pool.query(
      `UPDATE users SET
         verification_code = $1,
         code_expires_at = $2,
         failed_attempts = 0,
         locked_until = NULL,
         updated_at = now()
       WHERE id = $3`,
      [code, expiresAt, row.id],
    );

    const user = this.mapRow({ ...row, verification_code: code, code_expires_at: expiresAt, failed_attempts: 0, locked_until: null });
    return { user, verificationCode: code, expiresAt };
  }

  /**
   * A1 step2: 用 verification_code 换取完整 token pair
   */
  async completeLogin(email: string, code: string): Promise<User> {
    const result = await pool.query(
      `SELECT * FROM users
        WHERE email = $1
          AND verification_code = $2
          AND code_expires_at > now()`,
      [email, code],
    );
    if (result.rows.length === 0) {
      // 可能是 code 错误 / 已过期
      const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (exists.rows.length > 0) {
        // 失败计数 + 锁定判定
        await this.recordFailedAttempt(exists.rows[0].id);
      }
      throw new Error('Invalid or expired verification code');
    }
    const row = result.rows[0];

    // 消费 code,清空 + 重置失败计数
    await pool.query(
      `UPDATE users SET verification_code = NULL, code_expires_at = NULL,
                        failed_attempts = 0, locked_until = NULL, updated_at = now()
        WHERE id = $1`,
      [row.id],
    );

    return this.mapRow(row);
  }

  async login(email: string, password: string): Promise<User> {
    // 兼容旧 /api/auth/login: 直接走 step1 + step2 (auto)
    const step1 = await this.beginLogin(email, password);
    return this.completeLogin(email, step1.verificationCode);
  }

  private async recordFailedAttempt(userId: string): Promise<void> {
    const result = await pool.query(
      `UPDATE users SET failed_attempts = failed_attempts + 1, updated_at = now()
        WHERE id = $1 RETURNING failed_attempts`,
      [userId],
    );
    const failed = result.rows[0]?.failed_attempts ?? 0;
    if (failed >= LOCKOUT_THRESHOLD) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      await pool.query(
        'UPDATE users SET locked_until = $1, updated_at = now() WHERE id = $2',
        [lockedUntil, userId],
      );
    }
  }

  async unlock(userId: string): Promise<void> {
    await pool.query(
      'UPDATE users SET locked_until = NULL, failed_attempts = 0, updated_at = now() WHERE id = $1',
      [userId],
    );
  }

  async findById(id: string): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async findBySid(sid: string): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE sid = $1', [sid]);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async list(): Promise<User[]> {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows.map((r: any) => this.mapRow(r));
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    await pool.query('UPDATE users SET role = $1, updated_at = now() WHERE id = $2', [role, userId]);
  }

  async updatePhone(userId: string, phone: string | null): Promise<void> {
    await pool.query('UPDATE users SET phone = $1, updated_at = now() WHERE id = $2', [phone, userId]);
  }

  async setActive(userId: string, active: boolean): Promise<void> {
    await pool.query('UPDATE users SET is_active = $1, updated_at = now() WHERE id = $2', [active, userId]);
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) throw new Error('User not found');

    const valid = await bcrypt.compare(oldPassword, result.rows[0].password_hash);
    if (!valid) throw new Error('Current password is incorrect');

    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, userId]);
  }

  async resetPassword(userId: string, newPassword: string): Promise<void> {
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, userId]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async isEmpty(): Promise<boolean> {
    const result = await pool.query('SELECT COUNT(*) as count FROM users');
    return parseInt(result.rows[0].count) === 0;
  }

  private mapRow(row: any): User {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      name: row.name,
      role: row.role as UserRole,
      isActive: row.is_active,
      avatarUrl: row.avatar_url,
      feishuUserId: row.feishu_user_id,
      sid: row.sid ?? null,
      phone: row.phone ?? null,
      failedAttempts: row.failed_attempts ?? 0,
      lockedUntil: row.locked_until ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
