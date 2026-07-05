import { describe, it, expect } from "vitest";
import { buildCompletionCard, buildTaskListCard, buildStreamingCard, buildErrorCard } from "../cardkit-renderer.js";

describe("CardKit Renderer", () => {
  it("buildCompletionCard generates valid JSON 2.0", () => {
    const card = buildCompletionCard({ body: "test" });
    const parsed = JSON.parse(card);
    expect(parsed.schema).toBe("2.0");
    expect(parsed.body.elements.length).toBeGreaterThanOrEqual(4);
  });

  it("buildCompletionCard has 4 persistent buttons", () => {
    const card = buildCompletionCard({ body: "hi" });
    const parsed = JSON.parse(card);
    const cs = parsed.body.elements.find((e) => e.tag === "column_set");
    expect(cs.columns).toHaveLength(4);
  });

  it("buildCompletionCard delete button has confirm", () => {
    const card = buildCompletionCard({ body: "hi" });
    const parsed = JSON.parse(card);
    const cs = parsed.body.elements.find((e) => e.tag === "column_set");
    expect(cs.columns[3].elements[0].confirm).toBeDefined();
  });

  it("buildTaskListCard generates task list", () => {
    const card = buildTaskListCard({
      tasks: [{ id: "t1", title: "test", status: "active", lastActivity: "now" }],
      closedCount: 3,
    });
    const parsed = JSON.parse(card);
    expect(parsed.schema).toBe("2.0");
  });

  it("buildStreamingCard generates thinking card", () => {
    const card = buildStreamingCard("question");
    const parsed = JSON.parse(card);
    expect(parsed.header.title.content).toContain("思考");
  });

  it("buildErrorCard generates red header", () => {
    const card = buildErrorCard("err");
    const parsed = JSON.parse(card);
    expect(parsed.header.template).toBe("red");
  });
});
