import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 bg-background text-foreground">
      <div className="flex flex-col items-center gap-3 text-center max-w-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Day 1 · Setup OK
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">
          Panmira 数智资源管理
        </h1>
        <p className="text-muted-foreground">
          Next.js 16 + React 19 + Tailwind v4 + shadcn/ui + tweakcn (AstroVista)
        </p>
      </div>
      <div className="flex gap-3">
        <Button render={<Link href="/login" />}>登录</Button>
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "outline" })}
        >
          进入 Dashboard
        </Link>
      </div>
    </main>
  );
}
