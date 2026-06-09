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
  bigint,
  numeric,
  date,
  serial,
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

const byteaColumn = customType<{ data: Buffer; driverData: string }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: Buffer) {
    return value.toString('hex');
  },
  fromDriver(value: string): Buffer {
    return Buffer.from(value, 'hex');
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

export const botConfigs = pgTable('bot_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  platform: varchar('platform', { length: 20 }).notNull(),
  configJson: jsonb('config_json').notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  botId: uuid('bot_id').defaultRandom(),
  remark: text('remark').default(''),
  displayName: text('display_name'),
});

// ── bot_secrets ──────────────────────────────────────────────────────────────

export const botSecrets = pgTable('bot_secrets', {
  id: uuid('id').primaryKey().defaultRandom(),
  botName: varchar('bot_name', { length: 255 }).notNull(),
  keyType: varchar('key_type', { length: 50 }).notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── bot_budgets ──────────────────────────────────────────────────────────────

export const botBudgets = pgTable('bot_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  botName: varchar('bot_name', { length: 255 }).notNull(),
  dailyLimitUsd: numeric('daily_limit_usd').default('0'),
  todaySpent: numeric('today_spent').default('0'),
  todayTasks: integer('today_tasks').default(0),
  paused: boolean('paused').default(false),
  lastRollover: date('last_rollover', { mode: 'string' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── skills ───────────────────────────────────────────────────────────────────

export const skills = pgTable('skills', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull().default(''),
  version: integer('version').notNull().default(1),
  author: varchar('author', { length: 255 }).notNull().default(''),
  tags: jsonb('tags').notNull().default([]),
  userInvocable: boolean('user_invocable').notNull().default(true),
  context: text('context'),
  allowedTools: text('allowed_tools'),
  skillMd: text('skill_md').notNull(),
  referencesTar: byteaColumn('references_tar'),
  publishedAt: varchar('published_at', { length: 100 }).notNull(),
  updatedAt: varchar('updated_at', { length: 100 }).notNull(),
});

// ── bot_skill_bindings ───────────────────────────────────────────────────────

export const botSkillBindings = pgTable('bot_skill_bindings', {
  id: uuid('id').primaryKey().defaultRandom(),
  botId: uuid('bot_id')
    .notNull()
    .references(() => botConfigs.botId),
  skillId: varchar('skill_id', { length: 255 })
    .notNull()
    .references(() => skills.id),
  priority: integer('priority').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── bot_agent_history ────────────────────────────────────────────────────────

export const botAgentHistory = pgTable('bot_agent_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  botId: uuid('bot_id')
    .notNull()
    .references(() => botConfigs.botId),
  agentName: varchar('agent_name', { length: 255 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow(),
  changedBy: varchar('changed_by', { length: 255 }),
  oldValue: jsonb('old_value'),
  newValue: jsonb('new_value'),
});

// ── documents ────────────────────────────────────────────────────────────────

export const documents = pgTable('documents', {
  id: varchar('id', { length: 255 }).primaryKey(),
  title: varchar('title', { length: 500 }).notNull(),
  folderId: varchar('folder_id', { length: 255 }).notNull().default('root'),
  path: varchar('path', { length: 1000 }).notNull(),
  content: text('content').default(''),
  tags: jsonb('tags').default([]),
  createdBy: varchar('created_by', { length: 255 }).default(''),
  createdAt: varchar('created_at', { length: 100 }),
  updatedAt: varchar('updated_at', { length: 100 }),
  embedding: vectorColumn('embedding'),
  contentHash: text('content_hash'),
  summary: text('summary'),
  qualityScore: integer('quality_score'),
  feedbackCount: integer('feedback_count'),
  fileUrl: text('file_url'),
  botId: uuid('bot_id').references(() => botConfigs.botId),
});

// ── document_chunks ──────────────────────────────────────────────────────────

export const documentChunks = pgTable('document_chunks', {
  id: varchar('id', { length: 255 }).primaryKey(),
  documentId: varchar('document_id', { length: 255 })
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  heading: varchar('heading', { length: 500 }),
  embedding: vectorColumn('embedding'),
  createdAt: varchar('created_at', { length: 100 }),
});

// ── folders ──────────────────────────────────────────────────────────────────

export const folders = pgTable('folders', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 500 }).notNull(),
  parentId: varchar('parent_id', { length: 255 }),
  path: varchar('path', { length: 1000 }).notNull(),
  visibility: varchar('visibility', { length: 50 }).notNull().default('shared'),
  createdAt: varchar('created_at', { length: 100 }),
  updatedAt: varchar('updated_at', { length: 100 }),
  botId: uuid('bot_id').references(() => botConfigs.botId),
});

// ── sessions ─────────────────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  botName: text('bot_name'),
  claudeSessionId: text('claude_session_id'),
  workingDirectory: text('working_directory').notNull(),
  title: text('title').notNull(),
  platform: text('platform').notNull(),
  chatId: text('chat_id').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  botId: uuid('bot_id'),
});

// ── session_messages ─────────────────────────────────────────────────────────

export const sessionMessages = pgTable('session_messages', {
  id: serial('id').primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull(),
  text: text('text').notNull(),
  platform: varchar('platform', { length: 50 }).notNull(),
  costUsd: real('cost_usd'),
  durationMs: real('duration_ms'),
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
});

// ── session_links ────────────────────────────────────────────────────────────

export const sessionLinks = pgTable('session_links', {
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  chatId: varchar('chat_id', { length: 255 }).notNull(),
  platform: varchar('platform', { length: 50 }).notNull(),
  linkedAt: bigint('linked_at', { mode: 'number' }).notNull(),
});

// ── activity_events ──────────────────────────────────────────────────────────

export const activityEvents = pgTable('activity_events', {
  id: varchar('id', { length: 255 }).primaryKey(),
  type: varchar('type', { length: 50 }).notNull(),
  botName: varchar('bot_name', { length: 255 }).notNull(),
  chatId: varchar('chat_id', { length: 255 }).notNull(),
  userId: varchar('user_id', { length: 255 }),
  prompt: text('prompt'),
  responsePreview: text('response_preview'),
  costUsd: real('cost_usd'),
  durationMs: real('duration_ms'),
  errorMessage: text('error_message'),
  model: varchar('model', { length: 100 }),
  timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cacheReadTokens: integer('cache_read_tokens').default(0),
  cacheCreationTokens: integer('cache_creation_tokens').default(0),
  botId: uuid('bot_id').references(() => botConfigs.botId),
});

// ── provider_configs ─────────────────────────────────────────────────────────

export const providerConfigs = pgTable('provider_configs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().default('openai'),
  baseUrl: text('base_url').notNull().default(''),
  apiKeyEncrypted: text('api_key_encrypted'),
  model: text('model').notNull().default(''),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── memory_settings ──────────────────────────────────────────────────────────

export const memorySettings = pgTable('memory_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── templates ────────────────────────────────────────────────────────────────

export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 100 }).notNull(),
  content: jsonb('content').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── scheduled_tasks ──────────────────────────────────────────────────────────

export const scheduledTasks = pgTable('scheduled_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  botName: varchar('bot_name', { length: 255 }).notNull(),
  chatId: varchar('chat_id', { length: 255 }).notNull(),
  prompt: text('prompt').notNull(),
  executeAt: bigint('execute_at', { mode: 'number' }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  parentRecurringId: uuid('parent_recurring_id'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── recurring_tasks ──────────────────────────────────────────────────────────

export const recurringTasks = pgTable('recurring_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  botName: varchar('bot_name', { length: 255 }).notNull(),
  chatId: varchar('chat_id', { length: 255 }).notNull(),
  prompt: text('prompt').notNull(),
  cronExpr: varchar('cron_expr', { length: 100 }).notNull(),
  timezone: varchar('timezone', { length: 50 }).notNull().default('Asia/Shanghai'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  nextExecuteAt: bigint('next_execute_at', { mode: 'number' }).notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── async_tasks ──────────────────────────────────────────────────────────────

export const asyncTasks = pgTable('async_tasks', {
  id: varchar('id', { length: 16 }).primaryKey(),
  botName: text('bot_name').notNull(),
  chatId: text('chat_id').notNull(),
  prompt: text('prompt').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('accepted'),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  completedAt: bigint('completed_at', { mode: 'number' }),
  result: jsonb('result'),
  callbackChatId: text('callback_chat_id'),
  callbackBotName: text('callback_bot_name'),
});

// ── coordinator_configs ──────────────────────────────────────────────────────

export const coordinatorConfigs = pgTable('coordinator_configs', {
  id: text('id').primaryKey(),
  groupId: text('group_id').notNull(),
  coordinatorBot: text('coordinator_bot').notNull(),
  teamMembers: jsonb('team_members').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  groupName: text('group_name').notNull().default(''),
});

// ── sync_config ──────────────────────────────────────────────────────────────

export const syncConfig = pgTable('sync_config', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: text('value').notNull(),
});

// ── teams ────────────────────────────────────────────────────────────────────

export const teams = pgTable('teams', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  members: jsonb('members').notNull().default([]),
  roles: jsonb('roles').notNull().default({}),
  budgetDailyUsd: real('budget_daily_usd').notNull().default(0),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

// ── discovered_groups ────────────────────────────────────────────────────────

export const discoveredGroups = pgTable('discovered_groups', {
  chatId: text('chat_id').primaryKey(),
  chatName: text('chat_name').notNull().default(''),
  botName: text('bot_name').notNull().default(''),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── discovered_group_bots ────────────────────────────────────────────────────

export const discoveredGroupBots = pgTable('discovered_group_bots', {
  chatId: text('chat_id').notNull(),
  botName: text('bot_name').notNull(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
});

// ── group_memberships ────────────────────────────────────────────────────────

export const groupMemberships = pgTable('group_memberships', {
  groupId: varchar('group_id', { length: 255 }).notNull(),
  botName: varchar('bot_name', { length: 255 }).notNull(),
  joinedAt: bigint('joined_at', { mode: 'number' }).notNull(),
});

// ── document_mappings ────────────────────────────────────────────────────────

export const documentMappings = pgTable('document_mappings', {
  memoryDocId: varchar('memory_doc_id', { length: 255 }).primaryKey(),
  memoryPath: text('memory_path').notNull(),
  feishuNodeToken: varchar('feishu_node_token', { length: 255 }).notNull(),
  feishuDocId: varchar('feishu_doc_id', { length: 255 }).notNull(),
  contentHash: varchar('content_hash', { length: 255 }).notNull().default(''),
  syncedAt: varchar('synced_at', { length: 100 }).notNull(),
});

// ── folder_mappings ──────────────────────────────────────────────────────────

export const folderMappings = pgTable('folder_mappings', {
  memoryFolderId: varchar('memory_folder_id', { length: 255 }).primaryKey(),
  memoryPath: text('memory_path').notNull(),
  feishuNodeToken: varchar('feishu_node_token', { length: 255 }).notNull(),
});

// ── chat_sessions ────────────────────────────────────────────────────────────

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  botName: varchar('bot_name', { length: 255 }).notNull(),
  chatId: varchar('chat_id', { length: 255 }).notNull(),
  sessionId: text('session_id'),
  sessionIdEngine: varchar('session_id_engine', { length: 20 }),
  workingDirectory: text('working_directory').notNull(),
  lastUsed: bigint('last_used', { mode: 'number' }).notNull(),
  cumulativeTokens: bigint('cumulative_tokens', { mode: 'number' }).default(0),
  cumulativeCostUsd: numeric('cumulative_cost_usd').default('0'),
  cumulativeDurationMs: bigint('cumulative_duration_ms', { mode: 'number' }).default(0),
  model: varchar('model', { length: 100 }),
  modelEngine: varchar('model_engine', { length: 20 }),
  engine: varchar('engine', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── voice_identities ─────────────────────────────────────────────────────────

export const voiceIdentities = pgTable('voice_identities', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  registeredAt: bigint('registered_at', { mode: 'number' }).notNull(),
  defaultBotTeam: jsonb('default_bot_team'),
  permissions: jsonb('permissions'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── budget_history ───────────────────────────────────────────────────────────

export const budgetHistory = pgTable('budget_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  botName: varchar('bot_name', { length: 255 }).notNull(),
  date: date('date', { mode: 'string' }).notNull(),
  costUsd: numeric('cost_usd').notNull(),
  taskCount: integer('task_count').notNull(),
  inputTokens: bigint('input_tokens', { mode: 'number' }).default(0),
  outputTokens: bigint('output_tokens', { mode: 'number' }).default(0),
  cacheReadTokens: bigint('cache_read_tokens', { mode: 'number' }).default(0),
  cacheCreationTokens: bigint('cache_creation_tokens', { mode: 'number' }).default(0),
});

// ── circuit_breaker_states ───────────────────────────────────────────────────

export const circuitBreakerStates = pgTable('circuit_breaker_states', {
  botName: text('bot_name').primaryKey(),
  state: varchar('state', { length: 20 }).notNull().default('closed'),
  failures: integer('failures').notNull().default(0),
  lastFailure: bigint('last_failure', { mode: 'number' }).notNull().default(0),
  halfOpenSuccesses: integer('half_open_successes').notNull().default(0),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull().default(0),
});
