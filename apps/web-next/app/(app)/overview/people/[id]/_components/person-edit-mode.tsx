"use client";

/**
 * R14-BC 真人详情编辑模式 — 参考 /employees/[id]/_components/edit-mode.tsx
 * 但 save 调用 patchPerson(PATCH /api/auth/users/:id),不是 updateAgent。
 */

import * as React from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { patchPerson, type Person } from "../../../_components/data";

export interface EditCtx {
  editing: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  save: (patch: Record<string, unknown>) => Promise<boolean>;
  saving: boolean;
  error: string | null;
}

const Ctx = React.createContext<EditCtx | null>(null);

export function usePersonEdit(): EditCtx | null {
  return React.useContext(Ctx);
}

export function PersonEditPane({
  id,
  label,
  onSaved,
  readOnly,
  children,
}: {
  id: string;
  label: string;
  onSaved?: () => void;
  readOnly?: boolean;
  children: (ctx: EditCtx) => React.ReactNode;
}) {
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const ctx = React.useMemo<EditCtx>(
    () => ({
      editing,
      saving,
      error,
      startEdit: () => { setError(null); setEditing(true); },
      cancelEdit: () => { setError(null); setEditing(false); },
      save: async (patch) => {
        setSaving(true);
        setError(null);
        try {
          await patchPerson(id, patch as Parameters<typeof patchPerson>[1]);
          setEditing(false);
          onSaved?.();
          return true;
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : String(e));
          return false;
        } finally {
          setSaving(false);
        }
      },
    }),
    [editing, saving, error, id, onSaved],
  );

  return (
    <div className="relative">
      {!readOnly && (
        <div className="absolute right-0 top-0 z-10 flex items-center gap-1">
          {!editing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={ctx.startEdit}
              className="gap-1 text-[12px] text-foreground/55 hover:text-foreground"
              data-testid={`edit-${label}`}
              aria-label={`编辑 ${label}`}
            >
              <Pencil className="size-3.5" />
              <span>编辑</span>
            </Button>
          )}
        </div>
      )}
      <Ctx.Provider value={ctx}>{children(ctx)}</Ctx.Provider>
      {error && (
        <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          保存失败: {error}
        </div>
      )}
    </div>
  );
}

export function PersonEditBar({ onSave, saveLabel = "保存" }: { onSave: () => void; saveLabel?: string }) {
  const ctx = usePersonEdit();
  if (!ctx || !ctx.editing) return null;
  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" onClick={() => void onSave()} disabled={ctx.saving} className="gap-1.5 text-[12px]">
        {ctx.saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        {ctx.saving ? "保存中…" : saveLabel}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={ctx.cancelEdit} disabled={ctx.saving} className="gap-1.5 text-[12px]">
        <X className="size-3.5" />
        取消
      </Button>
    </div>
  );
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
      <span>{label}</span>
      {hint && <span className="normal-case tracking-normal text-foreground/30">· {hint}</span>}
    </div>
  );
}

export function PersonText({
  label, value, field, editing, draft, setDraft, placeholder, hint, mono = false,
}: {
  label: string;
  value: React.ReactNode;
  field: string;
  editing: boolean;
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
}) {
  if (!editing) {
    return (
      <div>
        <FieldLabel label={label} hint={hint} />
        <div className={`text-[14.5px] text-foreground/85 ${mono ? "font-mono text-[13px]" : ""}`}>
          {value === undefined || value === null || value === "" ? (
            <span className="text-foreground/40">—</span>
          ) : value}
        </div>
      </div>
    );
  }
  return (
    <div>
      <FieldLabel label={label} hint={hint} />
      <Input
        type="text"
        value={(draft[field] as string | undefined) ?? ""}
        onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
        placeholder={placeholder}
        className={mono ? "font-mono text-[13px]" : ""}
        data-testid={`field-${field}`}
      />
    </div>
  );
}

export function PersonSelect<T extends string>({
  label, value, field, editing, draft, setDraft, options, render,
}: {
  label: string;
  value: React.ReactNode;
  field: string;
  editing: boolean;
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  options: { value: T; label: string }[];
  render?: (v: T) => React.ReactNode;
}) {
  const current = (draft[field] as T | undefined) ?? (value as T);
  if (!editing) {
    return (
      <div>
        <FieldLabel label={label} />
        <div className="text-[14.5px] text-foreground/85">
          {value === undefined || value === null || value === "" ? (
            <span className="text-foreground/40">—</span>
          ) : render ? (
            render(value as T)
          ) : (
            <span>{String(value)}</span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div>
      <FieldLabel label={label} />
      <Select value={current} onValueChange={(v) => setDraft({ ...draft, [field]: v })}>
        <SelectTrigger className="h-9 w-full text-[13px]" data-testid={`field-${field}`}>
          <SelectValue placeholder="选择…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function personToDraft(person: Person, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f === "name") out[f] = person.name ?? "";
    else if (f === "email") out[f] = person.email ?? "";
    else if (f === "phone") out[f] = person.phone ?? "";
    else if (f === "avatarUrl") out[f] = person.avatarUrl ?? "";
    else if (f === "role") out[f] = person.role;
    else if (f === "department") out[f] = person.department ?? "";
    else if (f === "position") out[f] = person.position ?? "";
    else if (f === "employeeStatus") out[f] = person.employeeStatus ?? "active";
    else if (f === "isActive") out[f] = person.isActive;
  }
  return out;
}

export function diffDraft(
  original: Record<string, unknown>,
  draft: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(draft)) {
    const a = JSON.stringify(original[k] ?? null);
    const b = JSON.stringify(draft[k] ?? null);
    if (a !== b) patch[k] = draft[k];
  }
  return patch;
}
