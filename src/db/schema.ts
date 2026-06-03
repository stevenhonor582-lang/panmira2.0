import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  real,
  timestamp,
  jsonb,
  pgEnum,
  customType,
} from 'drizzle-orm/pg-core';

const vectorColumn = customType<{ data: number[]; driverData: string }>({
  dataType(dimensions: any = 1536) {
    return `vector(${dimensions})`;
  },
  toDriver(value: number[]) {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    return JSON.parse(value);
  },
});

export const userRoleEnum = pgEnum('user_role', ['admin', 'member']);

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  feishuConfig: jsonb('feishu_config'),
  settings: jsonb('settings').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  feishuUserId: varchar('feishu_user_id', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  role: userRoleEnum('role').notNull().default('member'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  name: varchar('name', { length: 255 }).notNull(),
  roleTemplate: varchar('role_template', { length: 255 }),
  description: text('description'),
  capabilities: jsonb('capabilities').default([]),
  tools: jsonb('tools').default([]),
  systemPrompt: text('system_prompt'),
  orchestration: jsonb('orchestration').default({}),
  boundary: jsonb('boundary').default({}),
  ironLaws: jsonb('iron_laws').default([]),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const memories = pgTable('memories', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  layer: integer('layer').notNull().default(1),
  userId: text('user_id').notNull(),
  agentId: text('agent_id'),
  tenantId: text('tenant_id').notNull(),
  importance: real('importance').default(0.5),
  accessCount: integer('access_count').default(0),
  lastAccessed: timestamp('last_accessed', { withTimezone: true }),
  embedding: vectorColumn('embedding'),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id),
  userId: uuid('user_id').references(() => users.id),
  agentId: uuid('agent_id').references(() => agents.id),
  action: varchar('action', { length: 255 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }),
  resourceId: varchar('resource_id', { length: 255 }),
  details: jsonb('details'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const routingBindings = pgTable('routing_bindings', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: varchar('group_id', { length: 255 }).notNull(),
  pattern: text('pattern'),
  targetBots: text('target_bots').array().notNull(),
  priority: integer('priority').default(50).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
