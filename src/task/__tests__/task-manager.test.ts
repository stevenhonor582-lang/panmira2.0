import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../db/index.js", () => ({ pool: { query: vi.fn() } }));
vi.mock("../../utils/logger.js", () => ({
  createLogger: () => ({ child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }) }),
}));

import { TaskManager } from "../task-manager.js";
import { pool } from "../../db/index.js";

describe("TaskManager", () => {
  let tm: TaskManager;
  beforeEach(() => { tm = new TaskManager(); vi.clearAllMocks(); });

  it("createTask: pauses old active + inserts new", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: "t1", chat_id: "c1", bot_name: "bot", sdk_session_id: null, title: "test", status: "active", last_activity_at: new Date() }] } as any);
    const task = await tm.createTask({ chatId: "c1", botName: "bot", initialPrompt: "hi" });
    expect(task.id).toBe("t1");
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it("listOpenTasks: returns active+paused+failed", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);
    const tasks = await tm.listOpenTasks("c1");
    expect(tasks).toHaveLength(0);
  });

  it("forceStop: updates active to paused", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);
    await tm.forceStop("c1");
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  it("deleteTask: soft delete", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);
    await tm.deleteTask("t1");
    expect(pool.query).toHaveBeenCalledWith(expect.anything(), ["t1"]);
  });

  it("closeTask: with reason", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);
    await tm.closeTask("t1", "natural");
    expect(pool.query).toHaveBeenCalled();
  });
});
