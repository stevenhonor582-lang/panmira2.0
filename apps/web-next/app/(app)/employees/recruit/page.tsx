import { Suspense } from "react";
import { NewBotWizard } from "../new/_components/wizard";

// R53-T5: 招聘流程的语义化入口。渲染同一个向导(NewBotWizard),
// 但正规路径是 /employees/recruit?hrId=<uuid>。无 hrId 时向导自身会跳回 /employees/hr 选岗位。
export default function Page() {
  return (
    <Suspense fallback={<div className="grid place-items-center py-32 text-sm text-foreground/50">载入中…</div>}>
      <NewBotWizard />
    </Suspense>
  );
}
