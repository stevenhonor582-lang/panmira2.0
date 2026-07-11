"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// R53-T5: /employees/new 保留为向后兼容的 redirect。
// 招聘流程的正规入口已改为 /employees/recruit(语义化)。
// 这里保留全部 query(hrId / type)转发,老链接/书签不失效。
function RedirectToRecruit() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const qs = params.toString();
    router.replace(`/employees/recruit${qs ? `?${qs}` : ""}`);
  }, [params, router]);
  return (
    <div className="grid place-items-center py-32 text-sm text-foreground/50">
      正在转到招聘流程…
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="grid place-items-center py-32 text-sm text-foreground/50">载入中…</div>}>
      <RedirectToRecruit />
    </Suspense>
  );
}
