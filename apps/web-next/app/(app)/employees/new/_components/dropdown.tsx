"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  hint?: string;
}

export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "请选择",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl bg-background px-3.5 py-2.5 text-left text-sm ring-1 ring-border transition-colors",
          open ? "ring-foreground/40" : "hover:ring-foreground/30",
        )}
      >
        <span className={current ? "text-foreground" : "text-foreground/45"}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn("size-4 text-foreground/45 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl bg-popover ring-1 ring-border shadow-lg shadow-black/5">
          <ul className="max-h-72 overflow-auto py-1">
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-2 px-3.5 py-2 text-left text-sm hover:bg-muted/60",
                    o.value === value && "bg-muted/40",
                  )}
                >
                  {o.value === value ? (
                    <Check className="mt-0.5 size-3.5 text-foreground" />
                  ) : (
                    <span className="mt-0.5 size-3.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{o.label}</div>
                    {o.hint && <div className="text-[11.5px] text-foreground/55">{o.hint}</div>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
