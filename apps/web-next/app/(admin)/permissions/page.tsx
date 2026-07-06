"use client";

import { ShieldCheck, Check, Minus } from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SCOPES, ROLES } from "./_components/types";

export default function PermissionsPage() {
  // 按 category 分组
  const grouped = SCOPES.reduce<Record<string, typeof SCOPES>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});
  const categories = Object.keys(grouped);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="size-5 text-muted-foreground" />
          Permissions
        </h2>
        <p className="text-sm text-muted-foreground">
          4 角色 × {SCOPES.length} scope 权限矩阵(spec § 5.3)
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">角色矩阵</CardTitle>
          <CardDescription>
            ✓ = 角色拥有该 scope · — = 无 · Admin = 通配 *
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-[280px]">
                  Scope
                </th>
                {ROLES.map((r) => (
                  <th key={r.name} className="px-3 py-2 text-center text-xs font-medium min-w-[120px]">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="font-medium text-foreground">{r.label}</span>
                      <span className="text-[10px] text-muted-foreground font-normal">
                        {r.name}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <>
                  <tr key={`cat-${cat}`} className="bg-muted/30 border-b border-border/50">
                    <td colSpan={ROLES.length + 1} className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      {cat}
                    </td>
                  </tr>
                  {grouped[cat].map((s) => (
                    <tr key={s.name} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="px-4 py-2 align-top">
                        <div className="font-mono text-xs">{s.name}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {s.description}
                        </div>
                      </td>
                      {ROLES.map((r) => {
                        const has = r.scopes.has(s.name);
                        return (
                          <td key={r.name} className="text-center align-middle">
                            {has ? (
                              <Check className="size-4 text-emerald-500 inline" />
                            ) : (
                              <Minus className="size-3.5 text-muted-foreground/40 inline" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 角色说明 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {ROLES.map((r) => (
          <Card key={r.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                {r.label}
                <Badge variant="outline" className="text-[10px] font-mono">
                  {r.scopes.size} scopes
                </Badge>
              </CardTitle>
              <CardDescription>{r.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
