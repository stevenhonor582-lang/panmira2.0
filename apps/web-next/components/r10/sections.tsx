/**
 * R10 — client wrapper for use in server-component pages.
 *
 * 用法 (server component 页面):
 *   import { RagStatsSection } from "@/components/r10/sections";
 *   ...
 *   <RagStatsSection />
 */
"use client";

import * as React from "react";
import {
  SessionsPanel, RagStatsPanel, UsageReportsPanel,
  PipelineRunsPanel, BotHistoryPanel,
} from "./data-panels";

export function SessionsSection() {
  return <div className="mt-6"><SessionsPanel /></div>;
}

export function RagStatsSection() {
  return <div className="mt-6"><RagStatsPanel /></div>;
}

export function UsageReportsSection() {
  return <div className="mt-6"><UsageReportsPanel /></div>;
}

export function PipelineRunsSection() {
  return <div className="mt-6"><PipelineRunsPanel /></div>;
}

export function BotHistorySection() {
  return <div className="mt-6"><BotHistoryPanel /></div>;
}
