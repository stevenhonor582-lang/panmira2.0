// 真人/员工 avatar - 不依赖后端头像 URL,用姓名首字 + 语义色
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  seed?: string;
}

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
  xl: "size-20 text-2xl",
};

function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return 180 + (Math.abs(h) % 150);
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/[一-龥]/.test(trimmed)) {
    return trimmed.slice(-2);
  }
  return trimmed
    .split(/\s+/)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

export function InitialsAvatar({ name, size = "md", className, seed }: Props) {
  const text = initials(name);
  const hue = hashHue(seed ?? name);
  const bg = `oklch(0.94 0.04 ${hue})`;
  const fg = `oklch(0.38 0.10 ${hue})`;
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full font-medium select-none",
        SIZE[size],
        className,
      )}
      style={{
        background: bg,
        color: fg,
        boxShadow: `inset 0 0 0 1px oklch(0.85 0.05 ${hue})`,
      }}
      aria-label={name}
    >
      {text}
    </div>
  );
}
