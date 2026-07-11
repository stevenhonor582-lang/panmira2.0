"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { HrDetail } from "./_components/hr-detail";

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  return <HrDetail id={id} />;
}
