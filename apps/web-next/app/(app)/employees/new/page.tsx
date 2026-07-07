import { Suspense } from "react";
import { NewBotWizard } from "./_components/wizard";

export default function Page() {
  return (
    <Suspense fallback={<div className="grid place-items-center py-32 text-sm text-foreground/50">载入中…</div>}>
      <NewBotWizard />
    </Suspense>
  );
}
