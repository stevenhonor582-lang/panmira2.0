-- ============================================================================
-- panmira Q1 数据真实性巡检 (列名修复版)
-- 2026-07-08
-- ============================================================================

\echo ''
\echo '== 1/8 agents =='
SELECT 'agents' as table_name, count(*) as total,
  count(*) FILTER (WHERE status='active') as active,
  count(*) FILTER (WHERE status='deprecated') as deprecated,
  count(*) FILTER (WHERE owner_user_id IS NOT NULL) as owned,
  count(*) FILTER (WHERE avatar_url LIKE '/avatars/%') as fake_avatar,
  count(*) FILTER (WHERE persona IS NOT NULL) as has_persona,
  count(*) FILTER (WHERE is_active=true) as is_active_t
FROM agents;

\echo ''
\echo '== 1.1/8 agents 详情 =='
SELECT id, name, role_template, status, avatar_url,
  persona IS NOT NULL as has_persona,
  default_engine, default_model,
  owner_user_id IS NOT NULL as owned,
  created_at::date as c
FROM agents ORDER BY name;

\echo ''
\echo '== 2/8 users =='
SELECT 'users' as table_name, count(*) as total,
  count(*) FILTER (WHERE is_active=true) as active,
  count(*) FILTER (WHERE role='admin') as admin_cnt,
  count(*) FILTER (WHERE role='operator') as op_cnt,
  count(*) FILTER (WHERE role='member') as mem_cnt,
  count(*) FILTER (WHERE phone IS NOT NULL) as has_phone,
  count(*) FILTER (WHERE sid IS NOT NULL) as has_sid
FROM users;

\echo ''
\echo '== 2.1/8 users 详情 =='
SELECT email, name, role, phone, sid, is_active, created_at::date
FROM users ORDER BY created_at;

\echo ''
\echo '== 3/8 agent_pipelines =='
SELECT 'agent_pipelines' as table_name, count(*) as total,
  count(*) FILTER (WHERE status='active') as active,
  count(*) FILTER (WHERE status='archived') as archived,
  count(*) FILTER (WHERE owner_id IS NOT NULL) as has_owner,
  count(*) FILTER (WHERE description IS NOT NULL) as has_desc,
  count(*) FILTER (WHERE trigger_type='schedule') as scheduled,
  count(*) FILTER (WHERE created_by IS NOT NULL) as has_created_by
FROM agent_pipelines;

\echo ''
\echo '== 3.1/8 pipelines 详情 =='
SELECT name, status, trigger_type,
  owner_id IS NOT NULL as has_owner,
  description IS NOT NULL as has_desc,
  nodes IS NOT NULL AND jsonb_array_length(nodes) > 0 as has_nodes,
  created_by IS NOT NULL as has_created_by,
  created_at::date as c
FROM agent_pipelines ORDER BY created_at DESC;

\echo ''
\echo '== 4/8 documents =='
SELECT 'documents' as table_name, count(*) as total,
  count(*) FILTER (WHERE module='knowledge') as in_kb,
  count(*) FILTER (WHERE bot_id IS NOT NULL) as bot_attached,
  count(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding,
  count(*) FILTER (WHERE kb_id IS NOT NULL) as in_kb_via_kb_id
FROM documents;

\echo ''
\echo '== 4.1/8 documents by module =='
SELECT module, count(*) FROM documents GROUP BY module ORDER BY count(*) DESC;

\echo ''
\echo '== 4.2/8 documents orphans =='
SELECT count(*) FILTER (WHERE folder_id IS NULL) as no_folder,
  count(*) FILTER (WHERE kb_id IS NULL) as no_kb_id,
  count(*) FILTER (WHERE bot_id IS NULL) as no_bot_id
FROM documents;

\echo ''
\echo '== 5/8 knowledge_bases =='
SELECT 'knowledge_bases' as table_name, count(*) as total,
  count(*) FILTER (WHERE document_count > 0) as with_docs,
  count(*) FILTER (WHERE chunk_count > 0) as with_chunks,
  count(*) FILTER (WHERE visibility='team') as team_visible,
  count(*) FILTER (WHERE tenant_id IS NOT NULL) as has_tenant
FROM knowledge_bases;

\echo ''
\echo '== 5.1/8 kb 详情 =='
SELECT name, document_count, chunk_count, visibility, tenant_id, created_at::date
FROM knowledge_bases ORDER BY created_at;

\echo ''
\echo '== 6/8 provider_configs =='
SELECT 'provider_configs' as table_name, count(*) as total,
  count(*) FILTER (WHERE is_default=true) as is_default,
  count(*) FILTER (WHERE type='LLM') as llm,
  count(*) FILTER (WHERE api_key_encrypted IS NOT NULL) as has_key,
  count(*) FILTER (WHERE model IS NOT NULL) as has_model
FROM provider_configs;

\echo ''
\echo '== 6.1/8 providers 详情 =='
SELECT name, type, model, is_default, base_url,
  api_key_encrypted IS NOT NULL as has_encrypted_key, created_at::date
FROM provider_configs ORDER BY is_default DESC, name;

\echo ''
\echo '== 7/8 bot_configs =='
SELECT 'bot_configs' as table_name, count(*) as total,
  count(*) FILTER (WHERE purpose='outbound') as outbound,
  count(*) FILTER (WHERE purpose='inbound') as inbound,
  count(*) FILTER (WHERE is_active=true) as active,
  count(*) FILTER (WHERE bot_id IS NOT NULL) as has_bot_id
FROM bot_configs;

\echo ''
\echo '== 7.1/8 bot_configs 详情 =='
SELECT display_name, platform, purpose, is_active,
  bot_id IS NOT NULL as has_bot_id, created_at::date
FROM bot_configs ORDER BY display_name;

\echo ''
\echo '== 8/8 folders (没有 is_root 字段,改用 visibility) =='
SELECT 'folders' as table_name, count(*) as total,
  count(*) FILTER (WHERE parent_id IS NULL) as root_folders,
  count(*) FILTER (WHERE parent_id IS NOT NULL) as has_parent,
  count(*) FILTER (WHERE bot_id IS NOT NULL) as bot_bound,
  count(*) FILTER (WHERE visibility='public') as public_vis,
  count(*) FILTER (WHERE visibility='shared') as shared_vis,
  count(*) FILTER (WHERE visibility='private') as private_vis
FROM folders;

\echo ''
\echo '== 8.1/8 folders 详情 (前 25) =='
SELECT id, name, visibility,
  parent_id IS NULL as is_root,
  parent_id IS NOT NULL as has_parent,
  bot_id IS NOT NULL as bot_bound,
  created_at
FROM folders ORDER BY parent_id NULLS FIRST, name LIMIT 25;

\echo ''
\echo '== users NO email =='
SELECT count(*) FROM users WHERE email IS NULL;

\echo ''
\echo '== people_profile_extended =='
SELECT count(*) as total,
  count(*) FILTER (WHERE department IS NOT NULL) as with_dept,
  count(*) FILTER (WHERE title IS NOT NULL) as with_title,
  count(*) FILTER (WHERE hired_at IS NOT NULL) as with_hired,
  count(*) FILTER (WHERE bio IS NOT NULL) as with_bio
FROM people_profile_extended;

\echo ''
\echo '== endpoint_health =='
SELECT count(*) as total,
  count(*) FILTER (WHERE healthy=true) as healthy,
  count(*) FILTER (WHERE healthy=false) as unhealthy,
  count(*) FILTER (WHERE latency_ms IS NOT NULL) as has_latency
FROM endpoint_health;

\echo ''
\echo '== audit_logs 活动度 =='
SELECT count(*) as total_all,
  count(*) FILTER (WHERE created_at > now() - interval '7 days') as last_7d,
  count(*) FILTER (WHERE created_at > now() - interval '1 day') as last_1d
FROM audit_logs;

\echo ''
\echo '== pipeline_runs 活动度 =='
SELECT count(*) as total_all,
  count(*) FILTER (WHERE started_at > now() - interval '7 days') as runs_7d,
  count(*) FILTER (WHERE status='succeeded') as succeeded,
  count(*) FILTER (WHERE status='failed') as failed
FROM pipeline_runs;

\echo '== END =='
