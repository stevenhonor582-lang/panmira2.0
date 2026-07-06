export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">总览 Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          数智资源总览 · Day 3 接入实时数据
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Agent", desc: "业务 Agent 数量" },
          { label: "模型", desc: "LLM + Embedding 池" },
          { label: "Skill / MCP", desc: "资源池" },
          { label: "KB", desc: "数智底座" },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-border bg-card p-4 space-y-1"
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {c.label}
            </p>
            <p className="text-2xl font-semibold tracking-tight">—</p>
            <p className="text-xs text-muted-foreground">{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
