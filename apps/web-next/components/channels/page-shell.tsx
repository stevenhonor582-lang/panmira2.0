import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Dense-config page shell used by every /channels/* page.
 * Provides a uniform header bar (subnav is rendered by the layout),
 * a left rail (PageMeta) and a right content area (children).
 *
 * No default 8px radius; uses 4px / 0 radius for chrome surfaces.
 */
export function ChannelsPageShell({
  meta,
  toolbar,
  children,
  className,
}: {
  meta?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 p-6 pt-4", className)}>
      {toolbar && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {toolbar}
        </div>
      )}
      <div className="grid grid-cols-12 gap-4">
        {meta && (
          <aside className="col-span-12 lg:col-span-3 xl:col-span-3">
            <div className="sticky top-4">{meta}</div>
          </aside>
        )}
        <section
          className={cn(
            "col-span-12",
            meta ? "lg:col-span-9 xl:col-span-9" : "lg:col-span-12",
          )}
        >
          {children}
        </section>
      </div>
    </div>
  );
}

/**
 * Dense metadata sidebar used on each page.
 * Surfaces the page's loadable counts and a short prose block.
 */
export function PageMeta({
  items,
  footnote,
}: {
  items: { label: string; value: React.ReactNode }[];
  footnote?: React.ReactNode;
}) {
  return (
    <div className="ring-1 ring-border rounded-sm bg-card/40">
      <div className="px-3 py-2 border-b border-border">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono">
          meta
        </div>
      </div>
      <dl className="px-3 py-2 divide-y divide-border">
        {items.map((it, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 gap-2">
            <dt className="text-[11px] text-muted-foreground font-mono uppercase tracking-wide">
              {it.label}
            </dt>
            <dd className="text-[12px] font-medium text-right truncate">
              {it.value}
            </dd>
          </div>
        ))}
      </dl>
      {footnote && (
        <div className="px-3 py-2 border-t border-border text-[11px] text-muted-foreground leading-snug">
          {footnote}
        </div>
      )}
    </div>
  );
}