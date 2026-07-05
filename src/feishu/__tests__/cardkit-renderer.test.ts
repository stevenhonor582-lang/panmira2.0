import { describe, it, expect } from "vitest";
import { buildCompletionCard, buildTaskListCard, buildStreamingCard, buildErrorCard } from "../cardkit-renderer.js";

describe("CardKit Renderer", () => {
  it("buildCompletionCard generates valid JSON 2.0", () => {
    const card = buildCompletionCard({ body: "test" });
    const parsed = JSON.parse(card);
    expect(parsed.config).toBeDefined();
    expect(parsed.elements.length).toBeGreaterThanOrEqual(4);
  });

  it("buildCompletionCard has 4 persistent buttons", () => {
    const card = buildCompletionCard({ body: "hi" });
    const parsed = JSON.parse(card);
    const cs = parsed.elements.find((e: any) => e.tag === "action");
    expect(cs.actions).toHaveLength(4);
  });

  it("buildCompletionCard delete button has confirm", () => {
    const card = buildCompletionCard({ body: "hi" });
    const parsed = JSON.parse(card);
    const cs = parsed.elements.find((e: any) => e.tag === "action");
    expect(cs.actions[3].confirm).toBeDefined();
  });

  it("buildTaskListCard generates task list", () => {
    const card = buildTaskListCard({
      tasks: [{ id: "t1", title: "test", status: "active", lastActivity: "now" }],
      closedCount: 3,
    });
    const parsed = JSON.parse(card);
    expect(parsed.config).toBeDefined();
  });

  it("buildStreamingCard generates thinking card", () => {
    const card = buildStreamingCard("question");
    const parsed = JSON.parse(card);
    expect(parsed.header.title.content).toContain("hinking");
  });

  it("buildErrorCard generates red header", () => {
    const card = buildErrorCard("err");
    const parsed = JSON.parse(card);
    expect(parsed.header.template).toBe("red");
  });
});
