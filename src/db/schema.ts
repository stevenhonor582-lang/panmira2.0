import {
  pgTable,
  uniqueIndex,
  index,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  real,
  doublePrecision,
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
  passwordHash: varchar('password_hash', { length: 255 }),

  avatarUrl: text('avatar_url'),
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
  displayName: text('display_name'),
  version: integer('version').default(1),
  deploymentType: varchar('deployment_type', { length: 30 }).notNull().default('bot'),
  // 'bot' | 'job' | 'api' | 'mixed'
  // R15-A: template vs instance + multi-bot working_dir + channel binding + visibility + temperature
  isTemplate: boolean('is_template').notNull().default(false),
  workingDir: text('working_dir'),
  channelIds: jsonb('channel_ids').$type<string[]>().default([]),
  visibility: varchar('visibility', { length: 20 }).notNull().default('team'),
  temperature: doublePrecision('temperature').notNull().default(0.7),
  // R33-A: agent-level model binding. These DB columns already exist but were
  // missing from the drizzle schema, so pipeline-engine couldn't read the
  // agent's chosen model via drizzle — root cause of "agent bound to DeepSeek
  // but global default (Minimax) wins at runtime". Now readable.
  defaultEngine: varchar('default_engine', { length: 64 }),
  defaultModel: varchar('default_model', { length: 128 }),
});

export const memories = pgTable('memories', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  layer: integer('layer').notNull().default(1),
  userId: text('user_id').notNull(),
  // R38-C1: agent-centric reintroduction. Nullable so legacy bot_id-only rows
  // still load. Backfilled in stage 2.
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  botId: uuid('bot_id'),
  tenantId: text('tenant_id').notNull(),
  importance: real('importance').default(0.5),
  accessCount: integer('access_count').default(0),
  lastAccessed: timestamp('last_accessed', { withTimezone: true }),
  embedding: vectorColumn('embedding', 1024),
  metadataJson: jsonb('metadata_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

  type: text('type').default('event'),
  polarity: text('polarity').default('affirm'),
  confidence: doublePrecision('confidence').default(0.5).notNull(),
  hitCount: integer('hit_count').default(0),
  lastHitAt: timestamp('last_hit_at', { withTimezone: true }),
  supersededBy: text('superseded_by'),
  invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
  subject: text('subject'),
  subjectNormalized: text('subject_normalized'),
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
  agentTemplateId: uuid('agent_template_id').references(() => agents.id, { onDelete: 'set null' }),
  // R34-A: 指向绑定的 agent 实例（非模板）。与 agentTemplateId 区别：
  //   agentTemplateId = 此 bot 基于哪个模板创建 (is_template=true 的 agent)
  //   agentId         = 此 bot 当前绑定的 agent 实例 (is_template=false 的 agent)
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
}, (t) => ({
  nameIdx: uniqueIndex('bot_configs_name_unique').on(t.name),
  templateIdx: index('bot_configs_template_idx').on(t.agentTemplateId),
  agentIdx: index('bot_configs_agent_id_idx').on(t.agentId),
}));

// ── bot_secrets ──────────────────────────────────────────────────────────────

export const botSecrets = pgTable('bot_secrets', {
  id: uuid('id').primaryKey().defaultRandom(),
  // R38-C1: agent_id FK nullable — same secret may still be looked up by botName.
  botName: varchar('bot_name', { length: 255 }).notNull(),
  agentId: uuid('agent_id'),
  keyType: varchar('key_type', { length: 50 }).notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  botKeyIdx: uniqueIndex('bot_secrets_bot_name_key_type_unique').on(t.botName, t.keyType),
}));

// ── bot_budgets ──────────────────────────────────────────────────────────────

export const botBudgets = pgTable('bot_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  botName: varchar('bot_name', { length: 255 }).notNull(),
  // R38-C1: agent_id nullable; populated when bot is bound to an agent.
  agentId: uuid('agent_id'),
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

  scope: text('scope').default('global'),
  ownerBot: text('owner_bot'),
  enabledByDefault: boolean('enabled_by_default').default(false),
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
  embedding: vectorColumn('embedding', 1024),
  contentHash: text('content_hash'),
  summary: text('summary'),
  qualityScore: integer('quality_score'),
  feedbackCount: integer('feedback_count'),
  fileUrl: text('file_url'),
  botId: uuid('bot_id').references(() => botConfigs.botId),
  // R34-A: document 归属的 agent 实例（通过 bot_configs.agent_id 反查填充）
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  // ── plan-B2: KB 关联 + 权限 + 版本化 ──
  kbId: uuid('kb_id'),
  kbType: varchar('kb_type', { length: 30 }),
  visibility: varchar('visibility', { length: 20 }).notNull().default('team'),
  kbVersion: integer('kb_version').notNull().default(1),
  ownerUserId: uuid('owner_user_id'),
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
  embedding: vectorColumn('embedding', 1024),
  createdAt: varchar('created_at', { length: 100 }),
  // ── plan-B2: chunk token 计数 ──
  chunkTokenCount: integer('chunk_token_count'),
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
  // R34-A: folder 归属的 agent 实例（通过 bot_configs.agent_id 反查填充）
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
});

// ── sessions ─────────────────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  botName: text('bot_name'),
  // R38-C1: nullable agent_id; backfilled in stage 2.
  agentId: uuid('agent_id'),
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
  // R38-C1: nullable agent_id; primary runtime anchor going forward.
  agentId: uuid('agent_id'),
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
  // R38-C1: nullable agent_id; runtime key for per-agent session continuity.
  agentId: uuid('agent_id'),
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
  // R38-C1: nullable agent_id; backfilled in stage 2.
  agentId: uuid('agent_id'),
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
  // R38-C1: nullable agent_id; primary key still botName for now.
  agentId: uuid('agent_id'),
  state: varchar('state', { length: 20 }).notNull().default('closed'),
  failures: integer('failures').notNull().default(0),
  lastFailure: bigint('last_failure', { mode: 'number' }).notNull().default(0),
  halfOpenSuccesses: integer('half_open_successes').notNull().default(0),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull().default(0),
});


// ── clarification_sessions ────────────────────────────────────────────────

export const clarificationSessions = pgTable('clarification_sessions', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  botId: text('bot_id').notNull(),
  targetSkill: text('target_skill').notNull(),
  payload: jsonb('payload').default({}),
  missingFields: jsonb('missing_fields').default([]),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── extracted_memories ────────────────────────────────────────────────────

export const extractedMemories = pgTable('extracted_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: text('run_id').notNull().default('auto'),
  type: text('type').notNull(),
  subject: text('subject').notNull(),
  subjectNormalized: text('subject_normalized').notNull(),
  payload: jsonb('payload').notNull().default({}),
  sourceQuote: text('source_quote'),
  confidence: real('confidence').notNull().default(0.5),
  polarity: text('polarity').default('affirm'),
  memoryId: text('memory_id'),
  lifecycleState: text('lifecycle_state').notNull().default('active'),
  supersededBy: uuid('superseded_by'),
  invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── extraction_audit_log ──────────────────────────────────────────────────

export const extractionAuditLog = pgTable('extraction_audit_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  runId: text('run_id').default('auto'),
  windowIdx: integer('window_idx'),
  step: text('step').notNull(),
  eventType: text('event_type').notNull(),
  subject: text('subject'),
  confidence: real('confidence'),
  payload: jsonb('payload').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── memories_eval ─────────────────────────────────────────────────────────

export const memoriesEval = pgTable('memories_eval', {
  id: serial('id').primaryKey(),
  runAt: timestamp('run_at', { withTimezone: true }).defaultNow(),
  recall5Avg: doublePrecision('recall5_avg'),
  recall10Avg: doublePrecision('recall10_avg'),
  mrrAvg: doublePrecision('mrr_avg'),
  queryCount: integer('query_count'),
  details: jsonb('details'),
});

// ── lead_bindings (Phase B: panmira chatId → NextCRM leadId 缓存) ──
export const leadBindings = pgTable('lead_bindings', {
  botName: varchar('bot_name', { length: 255 }).notNull(),
  chatId: varchar('chat_id', { length: 255 }).notNull(),
  leadId: varchar('lead_id', { length: 64 }).notNull(),
  platform: varchar('platform', { length: 50 }),
  boundAt: bigint('bound_at', { mode: 'number' }).notNull(),
});

// ── nextcrm_sync_outbox (Phase B: 回写 NextCRM 待发队列) ──
export const nextcrmSyncOutbox = pgTable('nextcrm_sync_outbox', {
  id: serial('id').primaryKey(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  nextRetryAt: bigint('next_retry_at', { mode: 'number' }),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

// ── plan-A foundation (2026-07-06): OAuth + user_teams + usage ──────────────

// user_teams: users × teams M:N 关联(saas spec §2.2)
export const userTeams = pgTable('user_teams', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').notNull(), // 跟 teams.id 关联(teams 是 varchar PK,这里不强制 FK,避免类型冲突)
  roleInTeam: varchar('role_in_team', { length: 20 }).notNull().default('team_member'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
});

// agent_team_auth: agent 授权给 team(saas spec §3.3 + §4.2)
export const agentTeamAuth = pgTable('agent_team_auth', {
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').notNull(),
  grantedBy: uuid('granted_by'),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
});

// oauth_clients: 外部系统接入凭据(saas spec §5)
export const oauthClients = pgTable('oauth_clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(), // web / native / cli / mcp_server
  clientId: varchar('client_id', { length: 64 }).notNull().unique(),
  clientSecretHash: varchar('client_secret_hash', { length: 200 }), // null = public client (PKCE)
  redirectUris: jsonb('redirect_uris').$type<string[]>().notNull().default([]),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// oauth_access_tokens: 短期 token (1h)
export const oauthAccessTokens = pgTable('oauth_access_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
  clientId: uuid('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }), // null = client_credentials
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// oauth_refresh_tokens: 长期 token (30d), rotation
export const oauthRefreshTokens = pgTable('oauth_refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: varchar('token_hash', { length: 128 }).notNull().unique(),
  accessTokenId: uuid('access_token_id').notNull().references(() => oauthAccessTokens.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  rotatedFrom: uuid('rotated_from'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// oauth_authorization_codes: 短期 code (10min)
export const oauthAuthorizationCodes = pgTable('oauth_authorization_codes', {
  code: varchar('code', { length: 128 }).primaryKey(),
  clientId: uuid('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  codeChallenge: varchar('code_challenge', { length: 128 }),
  codeChallengeMethod: varchar('code_challenge_method', { length: 10 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// oauth_device_codes: RFC 8628 device flow
export const oauthDeviceCodes = pgTable('oauth_device_codes', {
  deviceCode: varchar('device_code', { length: 128 }).primaryKey(),
  userCode: varchar('user_code', { length: 20 }).notNull().unique(),
  clientId: uuid('client_id').notNull().references(() => oauthClients.id, { onDelete: 'cascade' }),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  intervalSec: integer('interval_sec').notNull().default(5),
  authorizedUserId: uuid('authorized_user_id').references(() => users.id, { onDelete: 'set null' }),
  lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// external_oauth_credentials: Panmira 当 Client,存外部系统 token
export const externalOAuthCredentials = pgTable('external_oauth_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 50 }).notNull(), // github / feishu / wecom / ...
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  refreshTokenEncrypted: text('refresh_token_encrypted'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  scope: text('scope'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// usage_reports: 按日聚合的资源使用量
export const usageReports = pgTable('usage_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  date: varchar('date', { length: 10 }).notNull(), // YYYY-MM-DD
  dimension: varchar('dimension', { length: 30 }).notNull(), // token / skill / mcp / channel / knowledge
  dimensionKey: varchar('dimension_key', { length: 100 }).notNull(),
  count: bigint('count', { mode: 'number' }).notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
});

// ── plan-B1 (2026-07-06): 资源引擎 ──────────────────────────────────────────

// embedding_providers:跟 provider_configs 风格一致,text PK
export const embeddingProviders = pgTable('embedding_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull().default(''),
  apiKeyEncrypted: text('api_key_encrypted'),
  modelName: text('model_name').notNull().default(''),
  dimensions: integer('dimensions').notNull().default(1024),
  pricingPer1k: numeric('pricing_per_1k', { precision: 10, scale: 6 }).notNull().default('0'),
  isDefault: boolean('is_default').notNull().default(false),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// mcp_servers:独立 MCP 资源池(spec §10)
export const mcpServers = pgTable('mcp_servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id'), // 可空,空=Company 级
  name: varchar('name', { length: 100 }).notNull(),
  url: text('url').notNull(),
  transport: varchar('transport', { length: 20 }).notNull().default('http'), // http / sse
  authType: varchar('auth_type', { length: 20 }).notNull().default('none'), // oauth / api_key / none
  authRefId: uuid('auth_ref_id'), // FK → external_oauth_credentials
  apiKeyEncrypted: text('api_key_encrypted'), // 直接存 API key (MCP server 自身认证)
  // R29-C: 外部平台许可密钥(GitHub OAuth token / API key),与 MCP 自身认证区分
  externalPlatformName: varchar('external_platform_name', { length: 100 }),
  externalPlatformKeyEncrypted: text('external_platform_key_encrypted'),
  externalKeyLastRotated: timestamp('external_key_last_rotated', { withTimezone: true }),
  toolsCache: jsonb('tools_cache').$type<Array<{ name: string; description: string; schema: unknown }>>().default([]),
  healthStatus: varchar('health_status', { length: 20 }).notNull().default('unknown'),
  lastCheckAt: timestamp('last_check_at', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// agent_skill_refs:agent 绑 skill(spec §9.3)
export const agentSkillRefs = pgTable('agent_skill_refs', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  skillId: varchar('skill_id', { length: 255 }).notNull().references(() => skills.id, { onDelete: 'cascade' }),
  skillVersion: varchar('skill_version', { length: 20 }),
  params: jsonb('params').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
// agent_mcp_refs: agent 绑 MCP server (R38-C1 schema migration)
export const agentMcpRefs = pgTable('agent_mcp_refs', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  mcpServerId: uuid('mcp_server_id').notNull().references(() => mcpServers.id, { onDelete: 'cascade' }),
  params: jsonb('params').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// skill_usage:skill 调用日志,给 usage_reports 聚合
export const skillUsage = pgTable('skill_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  skillId: varchar('skill_id', { length: 255 }).notNull(),
  agentId: uuid('agent_id'),
  callCount: integer('call_count').notNull().default(1),
  successCount: integer('success_count').notNull().default(0),
  avgLatencyMs: integer('avg_latency_ms').notNull().default(0),
  date: varchar('date', { length: 10 }).notNull(), // YYYY-MM-DD
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});


// ── plan-B2 (2026-07-06): 数智底座 KB ─────────────────────────────────────

// knowledge_bases: 8 类 KB (industry/product/competitor/solution/pricing/company/department/personal)
export const knowledgeBases = pgTable('knowledge_bases', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id'), // 空=Company 级
  ownerUserId: uuid('owner_user_id'), // 非空=个人 KB
  type: varchar('type', { length: 30 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  visibility: varchar('visibility', { length: 20 }).notNull().default('team'),
  embeddingProviderId: text('embedding_provider_id').references(() => embeddingProviders.id),
  chunkSize: integer('chunk_size').notNull().default(512),
  chunkOverlap: integer('chunk_overlap').notNull().default(64),
  indexStatus: varchar('index_status', { length: 20 }).notNull().default('pending'),
  documentCount: integer('document_count').notNull().default(0),
  chunkCount: integer('chunk_count').notNull().default(0),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// agent_knowledge_refs: agent 绑 KB,带 topK + minScore 配置
export const agentKnowledgeRefs = pgTable('agent_knowledge_refs', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  kbId: uuid('kb_id').notNull().references(() => knowledgeBases.id, { onDelete: 'cascade' }),
  topK: integer('top_k').notNull().default(5),
  minScore: numeric('min_score', { precision: 4, scale: 3 }).notNull().default('0.5'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── plan-C (2026-07-06): Tenant Quota ─────────────────────────────────────
export const tenantQuotas = pgTable('tenant_quotas', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  dimension: varchar('dimension', { length: 30 }).notNull(), // token / skill / mcp / channel / knowledge
  period: varchar('period', { length: 10 }).notNull().default('daily'), // daily / monthly
  limitValue: bigint('limit_value', { mode: 'number' }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── plan-F (2026-07-06): 异步嵌入队列 ─────────────────────────────────────
export const embeddingJobs = pgTable('embedding_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  docId: varchar('doc_id', { length: 255 }).notNull(),
  kbId: uuid('kb_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  totalChunks: integer('total_chunks').notNull().default(0),
  embeddedChunks: integer('embedded_chunks').notNull().default(0),
  attempts: integer('attempts').notNull().default(0),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// plan-H1+blueprint sprint: skill_dags table (visual skill authoring, 2026-07-07)
export const skillDags = pgTable('skill_dags', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  skillId: varchar('skill_id', { length: 255 }).notNull().references(() => skills.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  nodes: jsonb('nodes').notNull().default([]).$type<Array<{id: string; type: string; label: string; config: Record<string, unknown>; position?: {x: number; y: number}}>>(),
  edges: jsonb('edges').notNull().default([]).$type<Array<{from: string; to: string; condition?: string; label?: string}>>(),
  inputSchema: jsonb('input_schema').default({}).$type<Record<string, unknown>>(),
  outputSchema: jsonb('output_schema').default({}).$type<Record<string, unknown>>(),
  validationStatus: varchar('validation_status', { length: 20 }).notNull().default('pending'),
  validationErrors: jsonb('validation_errors').default([]).$type<string[]>(),
  authorId: uuid('author_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});


// ── Phase 1: 3 deployment forms (Bot / Job / API) ──────────────────────────

// scheduled_jobs: cron/event/manual triggers for Agent internal processing
export const scheduledJobs = pgTable('scheduled_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  agentTemplateId: uuid('agent_template_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  triggerType: varchar('trigger_type', { length: 20 }).notNull(),
  // 'cron' | 'event' | 'manual'
  cronExpression: varchar('cron_expression', { length: 100 }),
  // for cron: standard 5-field cron expression (e.g., '0 23 * * *' = 每天23点)
  eventTopic: varchar('event_topic', { length: 200 }),
  // for event: topic name (e.g., 'order.created', 'invoice.paid')
  inputTemplate: jsonb('input_template').default({}),
  // for event: template to extract input from event payload
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastStatus: varchar('last_status', { length: 20 }),
  // 'success' | 'failed' | 'timeout' | 'running'
  lastDurationMs: integer('last_duration_ms'),
  lastError: text('last_error'),
  runCount: integer('run_count').notNull().default(0),
  successCount: integer('success_count').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  templateIdx: index('scheduled_jobs_template_idx').on(t.agentTemplateId),
  triggerIdx: index('scheduled_jobs_trigger_idx').on(t.triggerType),
}));

// agent_run_logs: unified call log for all deployment forms
export const agentRunLogs = pgTable('agent_run_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  agentTemplateId: uuid('agent_template_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  deploymentType: varchar('deployment_type', { length: 20 }).notNull(),
  // 'bot' | 'job' | 'api'
  deploymentRefId: varchar('deployment_ref_id', { length: 255 }),
  // bot_id / job_id / api_caller_id
  userId: uuid('user_id').references(() => users.id),
  // null for jobs
  sessionId: varchar('session_id', { length: 255 }),
  inputSummary: text('input_summary'),
  outputSummary: text('output_summary'),
  durationMs: integer('duration_ms'),
  tokensUsed: integer('tokens_used'),
  costUsd: numeric('cost_usd').default('0'),
  status: varchar('status', { length: 20 }).notNull(),
  // 'success' | 'failed' | 'timeout'
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  templateIdx: index('agent_run_logs_template_idx').on(t.agentTemplateId),
  createdIdx: index('agent_run_logs_created_idx').on(t.createdAt),
  typeIdx: index('agent_run_logs_type_idx').on(t.deploymentType),
}));


// ── Phase 2: Multi-Agent Pipeline (DAG orchestration) ───────────────────────

export const agentPipelines = pgTable('agent_pipelines', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description'),
  // DAG definition
  nodes: jsonb('nodes').notNull().default([]).$type<Array<{
    id: string;
    label: string;
    agentTemplateId: string;
    inputTemplate?: Record<string, unknown>;
    outputKey?: string;  // which key in node_state to pass forward
    timeoutMs?: number;
  }>>(),
  edges: jsonb('edges').notNull().default([]).$type<Array<{
    from: string;
    to: string;
    condition?: string;  // optional: only follow if expression true
  }>>(),
  // Trigger config
  triggerType: varchar('trigger_type', { length: 20 }).notNull().default('manual'),
  // 'bot' | 'cron' | 'event' | 'manual' | 'api'
  triggerConfig: jsonb('trigger_config').default({}),
  // Execution config
  timeoutMs: integer('timeout_ms').default(600000),  // 10 min default
  retryPolicy: jsonb('retry_policy').default({ maxAttempts: 1, backoffMs: 1000 }),
  enabled: boolean('enabled').notNull().default(true),
  // Stats
  runCount: integer('run_count').notNull().default(0),
  successCount: integer('success_count').notNull().default(0),
  avgDurationMs: integer('avg_duration_ms'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  tenantIdx: index('agent_pipelines_tenant_idx').on(t.tenantId),
  enabledIdx: index('agent_pipelines_enabled_idx').on(t.enabled),
}));

export const pipelineRuns = pgTable('pipeline_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  pipelineId: uuid('pipeline_id').notNull().references(() => agentPipelines.id, { onDelete: 'cascade' }),
  // Trigger info
  triggeredBy: varchar('triggered_by', { length: 30 }).notNull(),
  // 'user' | 'bot' | 'cron' | 'event' | 'api'
  triggeredByRef: varchar('triggered_by_ref', { length: 255 }),
  // bot_id / user_id / job_id
  // State
  status: varchar('status', { length: 20 }).notNull().default('running'),
  // 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled'
  currentNodeId: varchar('current_node_id', { length: 100 }),
  // Per-node execution state
  nodeStates: jsonb('node_states').notNull().default({}).$type<Record<string, {
    status: 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'waiting_for_human';
    input?: unknown;
    output?: unknown;
    error?: string;
    startedAt?: string;
    finishedAt?: string;
    durationMs?: number;
    tokensUsed?: number;
    /* R18: human-node decision fields, populated by the decide endpoint. */
    approval?: 'approved' | 'rejected';
    note?: string;
    decidedBy?: string;
    decidedAt?: string;
  }>>(),
  // Snapshot of node labels at trigger time, so Diff can detect label renames.
  // Format: { [nodeId]: label }. Nullable for backward compat with old runs.
  labelSnapshot: jsonb('label_snapshot').$type<Record<string, string> | null>(),
  // Final result
  result: jsonb('result'),
  error: text('error'),
  // Timing
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
}, (t) => ({
  pipelineIdx: index('pipeline_runs_pipeline_idx').on(t.pipelineId),
  statusIdx: index('pipeline_runs_status_idx').on(t.status),
  startedIdx: index('pipeline_runs_started_idx').on(t.startedAt),
}));

// Inter-agent messages (for debugging/audit)
export const agentMessages = pgTable('agent_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => pipelineRuns.id, { onDelete: 'cascade' }),
  fromAgentId: uuid('from_agent_id').references(() => agents.id),
  fromNodeId: varchar('from_node_id', { length: 100 }),
  toAgentId: uuid('to_agent_id').references(() => agents.id),
  toNodeId: varchar('to_node_id', { length: 100 }),
  payload: jsonb('payload').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  runIdx: index('agent_messages_run_idx').on(t.runId),
}));

// ── Phase 4 Level 4 Fix 3: Rate limit persistence (reload-bypass defense) ────
//
// Persists in-memory rate-limit state to DB so pm2 reloads / crashes don't
// reset daily caps (otherwise an attacker can trigger reloads to bypass limit).

export const rateLimitState = pgTable('rate_limit_state', {
  userId: uuid('user_id').primaryKey(),
  rateCount: integer('rate_count').notNull().default(0),
  rateResetAt: timestamp('rate_reset_at', { withTimezone: true }).notNull(),
  tokensUsed: integer('tokens_used').notNull().default(0),
  tokensResetAt: timestamp('tokens_reset_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  updatedIdx: index('rate_limit_state_updated_idx').on(t.updatedAt),
}));
