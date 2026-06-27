import type { BotConfigBase } from '../config.js';
import type { Logger } from '../utils/logger.js';
import { MemoryClient } from '../memory/memory-client.js';
import type { WorkspaceManager } from '../memory/workspace-manager.js';
import { pool } from '../db/index.js';
import { DocEmbedder } from '../memory/doc-embedder.js';

const MEMORY_VECTOR_THRESHOLD = 0.6;

// 2026-06-27: jieba 风格 bigram 分词
const STOP_CHARS = new Set([
  "的","了","在","是","我","有","和","就","不","都","一","上","也","很",
  "到","要","去","你","会","着","看","好","这","吗","呢","吧","把",
  "被","让","给","对","从","向","与","以","及","或","但","而","且","所",
  "其","之","中","下","能","做","用","那","类","还","再","已","没","可",
  "后","前","因","为","与","此","哪","里"
]);

function extractBigrams(text: string, maxKeywords = 20): string[] {
  const cleaned = text.replace(/[\s,，。！？、；：""\\（）【】\[\](){}0-9a-zA-Z_]+/g, "");
  const bigrams: string[] = [];
  for (let i = 0; i < cleaned.length - 1; i++) {
    const b = cleaned.substring(i, i + 2);
    if (STOP_CHARS.has(b[0]) || STOP_CHARS.has(b[1])) continue;
    bigrams.push(b);
  }
  return [...new Set(bigrams)].slice(0, maxKeywords);
}


export interface KnowledgeFetcherDeps {
  config: BotConfigBase;
  logger: Logger;
  memoryClient: MemoryClient;
  workspaceManager?: WorkspaceManager;
}

export interface KnowledgeResult {
  systemPromptOverride?: string;
  knowledgeContext: string | null;
  agentBoundSkills: string[];
}

export async function fetchKnowledgeContext(
  deps: KnowledgeFetcherDeps,
  text: string,
  chatId: string,
): Promise<KnowledgeResult> {
  let systemPromptOverride: string | undefined;
  let knowledgeFolders: string[] = deps.config.knowledgeFolders || [];
  let agentBoundSkills: string[] = [];

  if (deps.config.agentId) {
    try {
      const result = await pool.query('SELECT system_prompt, knowledge_folders, skills FROM agents WHERE id = $1', [
        deps.config.agentId,
      ]);
      deps.logger.info(
        {
          botName: deps.config.name,
          agentId: deps.config.agentId,
          found: result.rows.length > 0,
          hasPrompt: !!result.rows[0]?.system_prompt,
        },
        'Agent template resolved',
      );
      if (result.rows[0]?.system_prompt) {
        systemPromptOverride = result.rows[0].system_prompt;
      }
      if (Array.isArray(result.rows[0]?.knowledge_folders) && result.rows[0].knowledge_folders.length > 0) {
        knowledgeFolders = result.rows[0].knowledge_folders;
      }
      if (Array.isArray(result.rows[0]?.skills)) {
        agentBoundSkills = result.rows[0].skills;
      }
    } catch (err: any) {
      deps.logger.debug({ err: err?.message }, 'Agent lookup failed, using config systemPrompt');
    }
  }

  // Append shared guidance block to systemPromptOverride so all 5 bots
  // (不盈 / 信言 / 守静 / 得一 / 玄鉴) get the same anti-sycophancy +
  // no-hallucination baseline regardless of which agent template they
  // currently load. Block is appended at this point (after agent template
  // resolution) so every return path below gets the augmented override.
  const GUIDANCE_BLOCK =
    '\n\n## 真实性与反奉承铁律（适用于本会话）\n\n' +
    '### 1. 反奉承\n' +
    '- 禁止空肯定开头：「好问题」「你说得对」「确实」「哈哈」\n' +
    '- 用户陈述的事实有误时，直接指出并给依据，不要附和\n' +
    '- 用户的方案有技术问题时，必须反对并解释原因\n' +
    '- 禁止模糊话术：「差不多」「应该没问题」「可能也许大概」\n\n' +
    '### 2. 反幻象\n' +
    '- 涉及具体数字/API/版本号/文件路径/命令时，必须有依据；找不到就说「未找到可靠依据」\n' +
    '- 区分「事实」（有来源）和「推测」（无来源）；推测必须标注「这是推测，未验证」\n' +
    '- 引用前确认存在，不要凭「看起来应该这样」编造\n' +
    '- 工具调用失败或检索返回空时，明示用户「未找到」并问是否换方向\n\n' +
    '### 3. 引用规范\n' +
    '- 引用检索到的文档时，每条附 [来源: title, confidence: 0.82, 时间: 2026-06-15]\n' +
    '- 没有 confidence >= 0.5 的引用就别说「基于已有资料」\n' +
    '- 知识库没有的内容就是没有，不要补全\n\n' +
    '### 4. 多版本处理（重要）\n' +
    '- 当检索返回 ≥2 个相似文档（可能是同一材料的不同版本或重复上传）时，必须在回复里列出**所有版本**（含时间、来源 folder）\n' +
    '- 必须明确问用户「用哪个版本」\n' +
    '- **禁止**默认挑第一个 / 最新的 / 最高 quality_score 的回答\n' +
    '- **禁止**自己合并/综合多个版本的内容（版本可能互斥，合并会失真）\n' +
    '- 如果用户已指定版本（例如「用 v3」「用 final」），按用户说的来；否则列出全部候选\n\n' +
    '### 5. 单问题约束（重要）\n' +
    '- AskUserQuestion **每次最多问 1 个问题**\n' +
    '- 如需澄清多个独立问题，**分多次调用** AskUserQuestion，每次只问 1 个\n' +
    '- **禁止**一次调用多问题（多问题卡片会让用户逐个点选，panmira-飞书桥接层会错配 Q2 答案到 Q1）\n' +
    '- 如果你有 3 个相关问题，弹 3 张卡片（每张 1 个问题）比 1 张卡片（3 个问题）好\n' +
    '- 唯一例外：如果多个问题的选项完全互斥且必须同时选（如「选 A 还是 B」），可以放 1 张多问题卡片，但**必须**在 prompt 里明确告诉用户「每个问题都要点选」' + '\n\n' + '### 6. AskUserQuestion 决策表（替代规则列表）\n\n' + '**决策点 1 — 何时调用 AskUserQuestion:**\n' + '| 用户输入 | 决策 |\n' + '| 用户明确「列出选项」「让我选」 | ✅ 调用 1 张卡片（最多 1 问题） |\n' + '| 用户问 bot 观点（「你觉得呢」「你同意吗」）| ❌ 不调用，直接回答 |\n' + '| 用户给模糊指令但有上下文 | ❌ 不调用，按用户指令执行 |\n' + '| 纯模糊 + 无上下文 | ✅ 调用，最多 1 张卡片 |\n\n' + '**决策点 2 — 收到 answer 后:**\n' + '| 用户输入 | 决策 |\n' + '| 点 4 个选项之一 | 按选项执行，结束卡片 |\n' + '| 输入文本（不在选项中）| 当用户实际意图，结束卡片 |\n' + '| 5 分钟无响应（autoAnswer）| 填默认「用户未及时回复」+ 通知 |\n' + '| **任何场景** | **禁止**调新 AskUserQuestion 二次澄清 |\n\n' + '**铁律（不依赖决策点）:**\n' + '- 禁止用 memory confidence 跳过用户输入（fix-11 保留）\n' + '- 禁止「已问 N 次无答复」自动推荐\n' + '- 决策来源声明: 「按用户选项 X 执行」或「按用户原文 <片段> 执行」';
  if (systemPromptOverride) {
    systemPromptOverride = systemPromptOverride + GUIDANCE_BLOCK;
  }

  // Only return early if text is empty. knowledgeFolders can be empty -
  // workspaceManager fallback will populate folderUuids below.
  if (!text) {
    return { systemPromptOverride, knowledgeContext: null, agentBoundSkills };
  }

  // Skip knowledge search for short continuation messages (续接、确认、闲聊)
  const trimmed = text.trim();
  if (trimmed.length < 15) {
    const contPat = /^(继续|检查|排查|修一下|怎么样|好了吗|完成了吗|接着|看看|查一下|测一下|试一下|好的|ok|嗯|哦|知道了|收到|明白|懂了|对|可以|行|好|谢谢|再见)$/i;
    if (contPat.test(trimmed)) {
      return { systemPromptOverride, knowledgeContext: null, agentBoundSkills };
    }
  }

  let searchQuery = text.slice(0, 200);
  if (text.length > 200) {
    const lastSentence = text.slice(200).match(/[。！？.!?\n][^。！？.!?\n]*$/);
    if (lastSentence) searchQuery += lastSentence[0].slice(0, 100);
  }

  // Resolve knowledge folder names to actual folder UUIDs
  let folderUuids: string[] = [];
  if (deps.workspaceManager) {
    try {
      const botFolderIds = await deps.workspaceManager.getBotFolderIds(deps.config.name);
      folderUuids = botFolderIds;
    } catch {}
  }
  // Resolve by name: bot workspace tree + organization public area
  // v22.3 fixed: knowledge_folders supports both personal + org folder names.
  // Agent template defines the list: ["知识沉淀","专业文档","R4-技术库",...]
  // If knowledge_folders is empty → default to 4 personal folders only.
  // Public area folders are searched ONLY if explicitly listed in knowledge_folders.
  if (knowledgeFolders.length > 0) {
    try {
      const nameResults = await pool.query(
        `SELECT f.id FROM folders f
         WHERE f.name = ANY($1)
           AND (f.path LIKE '%/数字员工/' || $2 || '/%' OR f.path LIKE '%/组织公共区/%')`,
        [knowledgeFolders, deps.config.name],
      );
      for (const row of nameResults.rows) {
        if (!folderUuids.includes(row.id)) folderUuids.push(row.id);
      }
    } catch {}
  }
  if (folderUuids.length === 0) {
    deps.logger.warn({ knowledgeFolders }, 'Folder UUID resolution failed, skipping knowledge search');
    return { systemPromptOverride, knowledgeContext: null, agentBoundSkills };
  }

  const results = await deps.memoryClient.searchInFolders(searchQuery, folderUuids, 20);
  // B-fix 2026-06-20: vector search for memories (semantic recall) with ILIKE fallback
  // Mirrors VMT 得一 N-1/N-2 fix: vector first, threshold decision, ILIKE as backup
  let memoryResults: any[] = [];
  let topRel = 0;
  try {
    const queryEmb = await new DocEmbedder(deps.logger as any).embed(searchQuery);
    const vecStr = JSON.stringify(queryEmb);
    // Use (SELECT id ...) not (SELECT bot_id ...) — fix VMT bug N-2 uuid/varchar type mismatch
    const { rows: vecRows } = await pool.query(
      `SELECT id, type, subject, subject_normalized, confidence, polarity, hit_count,
              LEFT(content, 300) AS snippet, last_hit_at,
              1 - (embedding <=> $1::vector) AS relevance
         FROM memories
         WHERE invalidated_at IS NULL
           AND bot_id = (SELECT bot_id FROM bot_configs WHERE name = $2 LIMIT 1)
           AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector ASC LIMIT 8`,
      [vecStr, deps.config.name],
    );
    const topRel = vecRows[0]?.relevance ?? 0;
    if (topRel >= MEMORY_VECTOR_THRESHOLD) {
      memoryResults = vecRows;
      deps.logger.info({ topRel, count: vecRows.length }, 'Memory vector search hit');
    } else {
      // Fallback: ILIKE (also fixed to use id not bot_id)
      const keywords = extractBigrams(searchQuery);
      let ilikeRows: any[] = [];
      if (keywords.length > 0) {
        const whereClauses = keywords.map((_, i) =>
          `(content ILIKE '%' || $${i + 2} || '%' OR subject ILIKE '%' || $${i + 2} || '%')`
        ).join(" OR ");
        const { rows } = await pool.query(
          `SELECT id, type, subject, subject_normalized, confidence, polarity, hit_count,
                  LEFT(content, 300) AS snippet, last_hit_at
             FROM memories WHERE invalidated_at IS NULL
              AND bot_id = (SELECT bot_id FROM bot_configs WHERE name = $1 LIMIT 1)
              AND (${whereClauses})
            ORDER BY hit_count DESC, confidence DESC LIMIT 8`,
          [deps.config.name, ...keywords]
        );
        ilikeRows = rows || [];
      }
      memoryResults = ilikeRows;
      deps.logger.info({ topRel, count: memoryResults.length, fallback: 'ilike' }, 'Memory search fell back to ILIKE');
    }
  } catch (err: any) {
    deps.logger.debug({ err: err?.message }, 'Memories search skipped');
  }

  // v1 RAG §4.2: Re-rank by recency + hit_count + confidence
  // score = 0.5*cosine + 0.2*recency + 0.2*hit_count + 0.1*confidence
  let ranked = results;
  let rankedWithScore: any[] = [];
  const startTime = Date.now();
  try {
    if (results.length > 0) {
      // 取每条的 metadata/hit_count/confidence (从 documents 或 memories)
      const ids = results.map(r => r.id);
      const { rows: metaRows } = await pool.query(
        `SELECT id, hit_count, confidence, updated_at, polarity FROM memories
          WHERE id = ANY($1) AND invalidated_at IS NULL`,
        [ids]
      ).catch(() => ({ rows: [] }));
      const metaMap = new Map(metaRows.map((r: any) => [r.id, r]));

      const HALF_LIFE_DAYS = 30;
      const now = Date.now();
      rankedWithScore = results
        .map(r => {
          const meta: any = metaMap.get(r.id);
          const cosine = 1 - (r.score || 0); // memory API: lower score = better
          // 2026-06-27 commit 1: recency + ageBoost 一起算
          const updatedTs = meta?.updated_at
            ? Math.exp(-((now - new Date(meta.updated_at).getTime()) / 86400000) * Math.LN2 / HALF_LIFE_DAYS)
            : 0.5;
          const createdTs = meta?.created_at
            ? Math.exp(-((now - new Date(meta.created_at).getTime()) / 86400000) * Math.LN2 / HALF_LIFE_DAYS)
            : 0.5;
          const recency = Math.max(updatedTs, 0.5);  // 旧 memory 至少 0.5
          const ageBoost = createdTs > 0.7 ? 0.3 : 0;  // 7 天内新 memory +0.3
          const hitCount = Math.min(1, (meta?.hit_count || 0) / 10);
          const confidence = meta?.confidence ?? 0.5;
          const finalScore = 0.45*cosine + 0.15*recency + 0.15*hitCount + 0.1*confidence + 0.15*ageBoost;
          return { r, finalScore, meta };
        })
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, 5)
        .map(x => x.r);

      // Bump hit_count only for docs actually injected into context (top 3)
      // M1-fix 2026-06-20: was UPDATE memories (wrong table) — IDs are document UUIDs not memory UUIDs.
      // Changed to UPDATE documents, plus added last_hit_at writeback.
      if ((metaRows as any[]).length > 0) {
        const injectedIds = ranked.slice(0, 3).map(r => r.id);
        if (injectedIds.length > 0) {
          await pool.query(
            `UPDATE memories SET hit_count = COALESCE(hit_count, 0) + 1, last_hit_at = NOW(), updated_at = NOW()
              WHERE id = ANY($1) AND invalidated_at IS NULL`,
            [injectedIds]
          ).catch((err: any) => deps.logger.debug({ err: err.message }, 'hit_count bump failed'));
        }
      }

      deps.logger.info(
        { 
          chatId, 
          resultCount: ranked.length, 
          topScore: rankedWithScore[0]?.finalScore ?? 0,
          topCosine: ranked.length > 0 ? (1 - (ranked[0].score || 0)) : 0,
        },
        'Knowledge re-ranked (v1)',
      );
    }
  } catch (err: any) {
    deps.logger.warn({ err: err?.message }, 'Re-rank failed, using raw results');
  }
  const finalResults = ranked;
  // Avoid naming conflict: replace `results` with `finalResults` below


  // P2.3: Search bot's own conversation history for cross-session recall
  let conversationContext = '';
  if (deps.workspaceManager) {
    try {
      const knowledgeFolderId = await deps.workspaceManager.getBotKnowledgeFolderId(deps.config.name);
      if (knowledgeFolderId) {
        const convResults = await deps.memoryClient.searchInFolders(searchQuery, [knowledgeFolderId], 10);
      // v1: re-rank by hit_count + recency
      const convRanked = [...convResults]
        .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))  // memory API: lower score = better match
        .slice(0, 5);

        const convItems = (convRanked || [])
          .filter((r: any) => {
            const tags = r.tags || [];
            return tags.some((t: string) => t === 'conversation-memory' || t === 'auto-archive');
          })
          .slice(0, 3);
        if (convItems.length > 0) {
          const convFormatted = convItems
            .map((r: any, i: number) => {
              const snippet = (r.snippet || '').replace(/<[^>]*>/g, '');
              const updated = r.updated_at ? r.updated_at.slice(0, 10) : '';
              return `### ${i + 1}. ${r.title}\n> 对话时间: ${updated}\n> ${snippet.slice(0, 200)}`;
            })
            .join('\n\n');
          conversationContext = `\n\n## 历史对话参考\n\n以下是你最近的对话记录，可帮助理解上下文连续性：\n\n${convFormatted}\n\n> 根据对话时效性，优先参考最近7天内的记录。\n`;
        }
      }
    } catch (err: any) {
      deps.logger.debug({ err: err?.message }, 'Conversation memory recall skipped');
    }
  }

  if (!finalResults || finalResults.length === 0) {
    if (conversationContext) {
      return { systemPromptOverride, knowledgeContext: conversationContext, agentBoundSkills };
    }
    return { systemPromptOverride, knowledgeContext: null, agentBoundSkills };
  }

  // v22.3: render by type
  // 2026-06-24 fix-11: filter out 'decision' type so bot cannot auto-pick
//   using memory confidence (e.g. "按 85% 推荐执行"). decision memories are
//   historical records of past decisions — they must NOT override the user's
//   current input. preference memories (style/tone) are still injected.
const prefDec = (memoryResults || []).filter((r: any) => r.type === 'preference');
  const factsEv = (memoryResults || []).filter((r: any) => ['fact','event'].includes(r.type));
  const docParts: string[] = [];
  // commit-15 (2026-06-25): strip confidence + relabel as [历史]
  //   so LLM cannot use these as decision basis. Per user.bot.behavior.no_auto_recommend 95%:
  //   - bot must NOT auto-pick based on memory
  //   - bot must NOT recommend X is 90% preference so do X
  //   - if no user input, bot says I dont know instead of guessing
  // commit-16 (2026-06-25): 事实呈现模式
  // 整个 knowledgeContext 框架重写为 '事实呈现'
  // Per user.bot_autonomy 95% + user.bot.behavior.no_auto_recommend 95%:
  //  - 决策权永远在用户
  //  - bot 看到 risk/issue -> 告诉用户，让用户决定
  //  - bot 不能说 '我推荐 X'，只能说 '我看到 X 事实'
  if (prefDec.length > 0) docParts.push(
    '### 相关事实（⚠️ 供参考，决策权在用户）\n' +
    'bot 看到这些事实后必须告诉用户，不能基于这些事实自主决策。\n' +
    'bot 不能说「我推荐 X」，只能说「我看到 X 事实」。\n\n' +
    prefDec.map((r: any) =>
      '- [历史] ' + r.subject + '\n' +
      '  > ' + (r.snippet || r.content || '').slice(0, 150) + '\n' +
      '  > （仅供参考，不替代用户当前决策）'
    ).join('\n')
  );
  // commit-16: facts/events 也用 '事实呈现' 模式
  if (factsEv.length > 0) docParts.push(
    '### 相关事实（⚠️ 供参考，决策权在用户）\n' +
    'bot 看到这些事实后必须告诉用户，不能基于这些事实自主决策。\n' +
    'bot 不能说「我推荐 X」，只能说「我看到 X 事实」。\n\n' +
    factsEv.map((r: any) =>
      '- [事实] ' + r.subject + '\n' +
      '  > ' + (r.snippet || r.content || '').slice(0, 200) + '\n' +
      '  > （仅供参考，不替代用户当前决策）'
    ).join('\n')
  );
  // Multi-version rendering: list ALL similar docs (don't truncate to 3),
  // each with updated_at + folder name from path, so the bot can see all
  // versions side-by-side and ask the user which one to use.
  const docs = finalResults.map((r: any, i: number) => {
    const title = r.title || '(untitled)';
    const updated = r.updated_at ? String(r.updated_at).slice(0, 10) : 'unknown';
    const folderName = r.path ? String(r.path).split('/').filter(Boolean).slice(-2, -1)[0] || 'unknown' : 'unknown';
    const snippet = String(r.snippet || '').replace(/<[^>]*>/g, '').slice(0, 250);
    return `### ${i + 1}. ${title}\n> 时间: ${updated} | 来源: ${folderName}\n> ${snippet}`;
  }).join('\n\n');
  if (docs) docParts.push('### 工作区文档\n' + docs);
  const formatted = docParts.join('\n\n');

  // Multi-version hint: when 2+ similar docs returned, append an explicit
  // reminder to the bot to list versions to the user (don't pick one).
  let versionHint = '';
  if (finalResults.length >= 2) {
    versionHint = `\n\n> ⚠️ **本检索返回 ${finalResults.length} 个相关文档**（可能是同一材料的不同版本或重复上传）。你**必须**在回复里列出所有版本（含时间），让用户选择用哪个；**禁止**默认挑第一个回答，**禁止**自己合并/综合。`;
  }

  const knowledgeContext = `## 相关知识参考\n\n以下是从知识库中检索到的相关资料，请参考这些信息回答用户问题：\n\n${formatted}${versionHint}${conversationContext}`;
  deps.logger.info(
    { chatId, folderCount: knowledgeFolders.length, resultCount: finalResults.length },
    'Knowledge injection applied',
  );
  // 2026-06-27 commit 5: 写 RAG 调用日志
  // 用于监控 topScore 趋势, 触发 P50 < 0.5 持续 6h 报警
  // 异步写, 不 block 主流程
  setImmediate(async () => {
    try {
      // 计算 topScore
      const topScore = rankedWithScore?.[0]?.finalScore ?? null;
      const topCosine = ranked.length > 0 ? (1 - (ranked[0].score || 0)) : null;
      const recallPath = (typeof topRel !== 'undefined' && topRel >= MEMORY_VECTOR_THRESHOLD) ? 'vector' : 'ilike';
      await pool.query(
        `INSERT INTO rag_query_log
          (bot_name, chat_id, query, query_length, top_score, top_cosine,
           result_count, recall_path, extraction_status, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          deps.config.name,
          chatId,
          (searchQuery || '').slice(0, 500),
          (searchQuery || '').length,
          topScore,
          topCosine,
          ranked.length,
          recallPath,
          memoryResults.length > 0 ? 'ok' : 'failed',
          Date.now() - startTime,
        ]
      );
    } catch (err: any) {
      deps.logger.debug({ err: err.message }, 'rag_query_log insert failed');
    }
  });

  return { systemPromptOverride, knowledgeContext, agentBoundSkills };
}
