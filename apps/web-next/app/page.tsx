"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { Loader2 } from "lucide-react";

/**
 * Root entry. Unauthenticated → /login, otherwise → /overview/dashboard.
 * The IA v6 default landing page is the company dashboard.
 */
export default function HomePage() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace(isAuthenticated() ? "/overview/dashboard" : "/login/");
  }, [router]);

  return (
    <div className="min-h-screen grid place-items-center bg-background text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}
