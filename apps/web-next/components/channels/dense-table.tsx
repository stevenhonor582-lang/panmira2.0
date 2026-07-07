import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Dense-table row primitives tuned for the IA v6 Channels surfaces.
 * No 8px default radius; chrome uses 4px. Geist Mono for ids/codes,
 * sans for prose. Generous horizontal density — 28px row height.
 */

interface DenseRow {
  cells: React.ReactNode[];
}

export function DenseTable({
  head,
  rows,
  empty,
  className,
}: {
  head: React.ReactNode[];
  rows: DenseRow[];
  empty?: React.ReactNode;
  className?: string;
}) {
  if (rows.length === 0 && empty) {
    return (
      <div className="ring-1 ring-border rounded-sm bg-card/30 px-3 py-8 text-center text-xs text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "ring-1 ring-border rounded-sm bg-card/40 overflow-hidden",
        className,
      )}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-mono">
            {head.map((h, i) => (
              <th
                key={i}
                className="text-left font-medium px-3 py-2 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
            >
              {row.cells.map((c, ci) => (
                <td
                  key={ci}
                  className="px-3 py-1.5 align-middle whitespace-nowrap"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MonoCell({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "font-mono text-[11.5px] text-foreground/85",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function KeyCell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}