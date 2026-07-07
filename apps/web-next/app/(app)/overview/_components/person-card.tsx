// 真人卡片 - 类名片,magcard-style
"use client";

import Link from "next/link";
import { Crown, Mail, Phone, ShieldCheck } from "lucide-react";
import { InitialsAvatar } from "./avatar";
import { StatusDot } from "./status-dot";
import { classifyPerson, type Person } from "./data";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<Person["role"], string> = {
  admin: "管理员",
  operator: "操作员",
  member: "成员",
};

interface Props {
  person: Person;
  isFounder?: boolean;
  className?: string;
}

export function PersonCard({ person, isFounder, className }: Props) {
  const status = classifyPerson(person);
  return (
    <Link
      href={`/overview/people/${person.id}`}
      className={cn(
        "group relative block rounded-xl border border-border bg-card p-5",
        "transition-[transform,box-shadow,border-color] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:shadow-[0_4px_16px_-4px_oklch(0.18_0.02_264_/_0.18)] hover:border-border/80",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        isFounder && "ring-1 ring-amber-500/20 dark:ring-amber-400/20",
        className,
      )}
    >
      {isFounder && (
        <span
          className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
          title="创始人 · 唯一 admin"
        >
          <Crown className="size-3" />
          <span>FOUNDER</span>
        </span>
      )}

      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <InitialsAvatar
            name={person.name}
            size="lg"
            seed={person.sid ?? person.email}
          />
          <span
            className="absolute -bottom-0.5 -right-0.5 ring-2 ring-card rounded-full"
            aria-hidden
          >
            <StatusDot status={status.status} />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap pr-14">
            <h3 className="text-base font-semibold tracking-tight leading-tight text-foreground truncate">
              {person.name}
            </h3>
            {person.sid && (
              <code className="font-mono text-[10.5px] uppercase tracking-wider rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                {person.sid}
              </code>
            )}
          </div>

          <div className="mt-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider flex-wrap">
            <ShieldCheck className="size-3 text-muted-foreground" />
            <span className="text-muted-foreground font-medium">
              {ROLE_LABEL[person.role]}
            </span>
            <span className="text-border">/</span>
            <StatusDot status={status.status} label={status.reason} withLabel />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-1.5 text-xs text-muted-foreground">
        {person.email && (
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="size-3.5 shrink-0 opacity-60" />
            <span className="truncate font-mono">{person.email}</span>
          </div>
        )}
        {person.phone && (
          <div className="flex items-center gap-2">
            <Phone className="size-3.5 shrink-0 opacity-60" />
            <span className="font-mono">{person.phone}</span>
          </div>
        )}
        {!person.email && !person.phone && (
          <div className="flex items-center gap-2 italic text-muted-foreground/70">
            <Mail className="size-3.5 shrink-0 opacity-40" />
            <span>未填联系方式</span>
          </div>
        )}
      </div>
    </Link>
  );
}
