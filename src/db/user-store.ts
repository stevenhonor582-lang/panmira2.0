/**
 * User store — registration, login, user management via PostgreSQL.
 */
import { pool } from './index.js';
import * as bcrypt from 'bcryptjs';

export interface User {
  id: string;
  tenantId: string;
  email: string | null;
  name: string;
  role: 'admin' | 'member';
  isActive: boolean;
  avatarUrl: string | null;
  feishuUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SALT_ROUNDS = 12;

export class UserStore {
  async register(email: string, password: string, displayName: string): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) throw new Error('Email already registered');

    const isFirst = await this.isEmpty();
    const role = isFirst ? 'admin' : 'member';
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    let tenantId: string;
    if (isFirst) {
      const tenantResult = await pool.query('INSERT INTO tenants (name) VALUES ($1) RETURNING id', ['Default']);
      tenantId = tenantResult.rows[0].id;
    } else {
      const defaultTenant = await pool.query('SELECT id FROM tenants LIMIT 1');
      tenantId = defaultTenant.rows[0].id;
    }

    const result = await pool.query(
      `INSERT INTO users (tenant_id, email, name, role, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, email, displayName, role, passwordHash],
    );

    return this.mapRow(result.rows[0]);
  }

  async login(email: string, password: string): Promise<User> {
    const result = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
    if (result.rows.length === 0) throw new Error('Invalid credentials');

    const row = result.rows[0];
    if (!row.password_hash) throw new Error('Invalid credentials');

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) throw new Error('Invalid credentials');

    return this.mapRow(row);
  }

  async findById(id: string): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async list(): Promise<User[]> {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows.map((r: any) => this.mapRow(r));
  }

  async updateRole(userId: string, role: 'admin' | 'member'): Promise<void> {
    await pool.query('UPDATE users SET role = $1, updated_at = now() WHERE id = $2', [role, userId]);
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
      role: row.role,
      isActive: row.is_active,
      avatarUrl: row.avatar_url,
      feishuUserId: row.feishu_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
