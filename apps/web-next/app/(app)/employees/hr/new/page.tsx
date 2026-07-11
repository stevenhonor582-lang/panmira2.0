import { Suspense } from "react";
import { HrWizard } from "./_components/hr-wizard";

// R55 块3 · 新建 HR 岗位独立入口(/employees/hr/new)。
// 与 /employees/new(数字员工招聘)彻底区分,不复用其向导。
// 支持 ?mode=blank(空白)与 ?mode=clone&hrId=<uuid>(复制现有)。
export default function Page() {
  return (
    <Suspense
      fallback={<div className="grid place-items-center py-32 text-sm text-foreground/50">载入中…</div>}
    >
      <HrWizard />
    </Suspense>
  );
}
