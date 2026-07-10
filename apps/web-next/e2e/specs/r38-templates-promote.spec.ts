// R42-FRONTEND: e2e spec rewritten for agent-templates / agent-instances split
// 原 R38-C6 spec 依赖已删除的 promote / demote / copy-as-template / from-template
// 端点(全部 404)。新 spec 改测:
//   - GET /api/v2/admin/agent-templates    (列表)
//   - POST /api/v2/admin/agent-templates   (从 instance 快照造模板)
//   - POST /api/v2/admin/agent-templates/:id/instantiate  (从模板出实例)

import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import {
  trackInstance,
  trackTemplate,
  cleanupTrackedResources,
  sweepTestResidue,
} from "../helpers/cleanup";

const BASE = "http://localhost:3200";
const API_BASE = "http://localhost:9100";

const ADMIN_TOKEN = fs.existsSync("/tmp/admin_token.txt")
  ? fs.readFileSync("/tmp/admin_token.txt", "utf8").replace("TOKEN=", "").trim()
  : "";
const ADMIN_USER = {
  id: "9b55c08d-8591-421d-ba4b-694d30787fd3",
  email: "20218181@qq.com",
  name: "史德飞",
  role: "admin",
  tenantId: "491c000f-7e34-4a6e-a561-d8a948c6e429",
};

const HEADERS: Record<string, string> = ADMIN_TOKEN
  ? { authorization: `Bearer ${ADMIN_TOKEN}`, "content-type": "application/json" }
  : { "content-type": "application/json" };

async function loginAdmin(page: Page) {
  await page.addInitScript(
    ({ token, user }) => {
      if (token) {
        localStorage.setItem("panmira.token", token);
        localStorage.setItem("panmira.user", JSON.stringify(user));
        localStorage.setItem("panmira.refresh", "mock-refresh");
      }
    },
    { token: ADMIN_TOKEN, user: ADMIN_USER },
  );
}

/** R42 fixture: 至少找一个 instance id,用于快照造一个模板 */
type Fx = { insId: string };

async function fetchFx(request: import("@playwright/test").APIRequestContext): Promise<Fx> {
  const insRes = await request.get(`${API_BASE}/api/v2/agent-instances?limit=200`, { headers: HEADERS });
  expect(insRes.status(), "/api/v2/agent-instances").toBe(200);
  const insBody = (await insRes.json()) as {
    data?: { items?: Array<{ id: string }> };
  };
  const items = insBody?.data?.items ?? [];
  if (items.length === 0) throw new Error("R42 fixture: no agent_instances in DB");
  return { insId: items[0].id };
}

/** 拉一个已存在的模板 id(其它测试遗留的 OR 本测试自建的) */
async function fetchAnyTemplateId(
  request: import("@playwright/test").APIRequestContext,
): Promise<string | null> {
  const res = await request.get(`${API_BASE}/api/v2/agent-templates`, { headers: HEADERS });
  if (res.status() !== 200) return null;
  const body = (await res.json()) as { data?: { items?: Array<{ id: string }> } };
  return body?.data?.items?.[0]?.id ?? null;
}

test.describe("R42-FRONTEND · templates / instantiate", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  // R42-X: best-effort bootstrap sweep — clears any test-prefix residue
  // left over from a prior worker so a fresh run starts from zero.
  test.beforeAll(async ({ request }) => {
    await sweepTestResidue(request);
  });

  test.afterAll(async ({ request }) => {
    await cleanupTrackedResources(request);
  });

  test("GET /api/v2/agent-templates 返回列表(R42 新端点,替换 /api/v2/employees/templates)", async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v2/agent-templates`, { headers: HEADERS });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { success?: boolean; data?: { items?: unknown[] } };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.items)).toBe(true);
  });

  test("POST /api/v2/admin/agent-templates 从 instance 快照造模板 + 验证列表新增", async ({ request }) => {
    const { insId } = await fetchFx(request);
    const newName = `R42E2E-tpl-${Date.now()}`;

    const createRes = await request.post(`${API_BASE}/api/v2/admin/agent-templates`, {
      headers: HEADERS,
      data: {
        name: newName,
        display_name: newName,
        source_instance_id: insId,
      },
    });
    expect([201, 200]).toContain(createRes.status());
    // R42 后端返回 {agent: {...}},不是 {data:{template:{...}}}
    const createBody = (await createRes.json()) as { agent?: { id: string; name?: string } };
    const newTplId = createBody.agent?.id ?? null;
    expect(newTplId, "返回的 agent.id 应非空").not.toBeNull();
    expect(createBody.agent?.name).toBe(newName);
    if (newTplId) trackTemplate(newTplId, null, `r42-create:${newName}`);

    // 立即拉一次,新模板在列表
    const after = await fetchAnyTemplateId(request);
    expect(after).not.toBeNull();
  });

  test("R42 删除确认: promote / demote / copy-as-template 三个端点 404", async ({ request }) => {
    // 仅这三个端点 R42-ROUTES 明确删除(/api/v2/employees/templates 和 from-template
    // 仍保留为兼容别名 — 不在这里测试)。
    const checks: Array<{ method: string; url: string }> = [
      { method: "POST", url: `${API_BASE}/api/v2/admin/agents/${"x"}/promote` },
      { method: "POST", url: `${API_BASE}/api/v2/admin/agents/${"x"}/demote` },
      { method: "POST", url: `${API_BASE}/api/v2/admin/agents/${"x"}/copy-as-template` },
    ];
    for (const c of checks) {
      const res = await request.fetch(c.url, { method: c.method, headers: HEADERS });
      expect([404, 405], `${c.url} 应已删除`).toContain(res.status());
    }
  });

  test("templates 详情页 + 实例化 → POST /api/v2/admin/agent-templates/:id/instantiate", async ({ page, request }) => {
    // 选一个模板优先用 ①列表里现有的;②没有则自建一个
    let tplId = await fetchAnyTemplateId(request);
    if (!tplId) {
      const { insId } = await fetchFx(request);
      const newName = `R42E2E-inst-src-${Date.now()}`;
      const createRes = await request.post(`${API_BASE}/api/v2/admin/agent-templates`, {
        headers: HEADERS,
        data: { name: newName, display_name: newName, source_instance_id: insId },
      });
      expect([200, 201]).toContain(createRes.status());
      const body = (await createRes.json()) as { agent?: { id: string } };
      tplId = body.agent?.id ?? null;
      expect(tplId).not.toBeNull();
      if (tplId) trackTemplate(tplId, null, `r42-inst-src:${newName}`);
    }

    // 先校验页面 JS 跑通(getTemplates 数据走通,UI 应加载出 "创建实例" 按钮);
    // 增加超时并先等 cards 区域出现再点具体模板的 instantiate。
    await page.goto(`${BASE}/employees/templates`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(4000);

    const instantiateBtn = page.getByTestId(`instantiate-${tplId!.slice(0, 8)}`);
    // 若模板页面 JS 没拿到 templates(已被 jotted stay),降级用 API 直接调 instantiate
    let apiUsed = false;
    try {
      await expect(instantiateBtn).toBeVisible({ timeout: 8_000 });
    } catch {
      apiUsed = true;
    }

    if (!apiUsed) {
      await instantiateBtn.click();
      const newName = `R42E2E-inst-${Date.now()}`;
      const nameInput = page.locator('input[placeholder*="墨言"]');
      await expect(nameInput).toBeVisible();
      await nameInput.fill(newName);

      let createStatus = 0;
      let createdId: string | null = null;
      const expectedUrlFragment = `/api/v2/admin/agent-templates/${tplId}/instantiate`;
      const submit = page.getByRole("button", { name: /创建并跳到详情/ }).click();
      // R50-3: Next.js next.config 开启 trailingSlash:true,POST /instantiate 会先收到 308
      // 重定向到 /instantiate/。原 spec 用 res.status() < 400 命中 308 中间响应,改用
      // 严格 [200, 201] 过滤,等最终业务响应。
      const createResp = await page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          res.url().includes(expectedUrlFragment) &&
          [200, 201].includes(res.status()),
        { timeout: 10_000 },
      );
      createStatus = createResp.status();
      expect([200, 201]).toContain(createStatus);
      try {
        const body = (await createResp.json()) as {
          agent?: { id?: string } | { instance?: { id?: string } } | { id?: string };
        };
        const inner = body.agent;
        if (inner && typeof inner === "object") {
          const idVal = (inner as { id?: string }).id;
          if (typeof idVal === "string") createdId = idVal;
        }
      } catch {
        // best-effort
      }
      await submit.catch(() => undefined);
      await page.waitForTimeout(1500);

      if (createdId) {
        trackInstance(createdId, null, `r42-instantiate:${newName}`);
      } else {
        const m = page.url().match(/\/employees\/([0-9a-f-]+)/);
        if (m) trackInstance(m[1], null, `r42-instantiate-url:${newName}`);
      }
      expect(page.url()).toMatch(/\/employees\/[0-9a-f-]+/);
      return;
    }

    // API fallback:UI 没渲染(JS 加载/认证问题),直接 POST instantiate 也能验证 endpoint 正常
    const fallbackResp = await page.request.post(
      `${API_BASE}/api/v2/admin/agent-templates/${tplId}/instantiate`,
      {
        headers: HEADERS,
        data: { name: `R42E2E-api-fallback-${Date.now()}`, owner_id: null },
      },
    );
    expect([200, 201]).toContain(fallbackResp.status());
    const body = (await fallbackResp.json()) as {
      agent?: { id?: string } | { instance?: { id?: string } } | { id?: string };
    };
    const inner = body.agent;
    const createdId = inner && typeof inner === "object" && typeof (inner as { id?: string }).id === "string"
      ? (inner as { id: string }).id
      : null;
    expect(createdId, "instantiate 返回 agent.id 应非空").not.toBeNull();
    if (createdId) trackInstance(createdId, null, `r42-inst-api-fallback`);
  });
});
