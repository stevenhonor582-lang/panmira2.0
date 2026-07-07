/**
 * L6+L8: Async pipeline trigger helper.
 *
 * Encapsulates the L6 async-mode call (`?async=true` → HTTP 202) and the
 * UI-side interpretation of the response, so both list and detail pages
 * share the same behaviour and it can be unit-tested without React/jsdom.
 */
export interface TriggerRequest {
  pipelineId: string;
  triggeredBy?: "user" | "bot" | "cron" | "event" | "api";
  initialInput?: Record<string, unknown>;
}

export interface TriggerAccepted {
  kind: "accepted";
  runId: string;
  pollUrl: string;
}

export interface TriggerCompleted {
  kind: "completed";
  runId: string;
  status: string;
  durationMs: number;
}

export interface TriggerFailed {
  kind: "failed";
  error: string;
}

export type TriggerResult = TriggerAccepted | TriggerCompleted | TriggerFailed;

/** Build the URL used by the trigger call. Always async-mode (L6). */
export function buildTriggerUrl(pipelineId: string): string {
  return `/api/v2/admin/pipelines/${pipelineId}/trigger?async=true`;
}

/**
 * Send the trigger request using the supplied fetcher.
 * Fetcher signature matches `(input, init) => Promise<Response>` from global fetch.
 *
 * Interprets the response:
 *   - 202 Accepted → { kind: "accepted", runId, pollUrl }
 *   - 200 OK with status !== "pending" → { kind: "completed", ... } (sync fallback)
 *   - 200 OK with error field → { kind: "failed", error }
 *   - non-2xx → throw so caller can surface error toast
 */
export async function triggerPipelineAsync(
  req: TriggerRequest,
  fetcher: typeof fetch,
): Promise<TriggerResult> {
  const res = await fetcher(buildTriggerUrl(req.pipelineId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      triggeredBy: req.triggeredBy ?? "user",
      initialInput: req.initialInput ?? {},
    }),
  });

  if (res.status === 202) {
    const body = await res.json();
    const data = body?.data ?? {};
    return {
      kind: "accepted",
      runId: String(data.runId ?? ""),
      pollUrl: String(data.pollUrl ?? `/api/v2/admin/pipelines/${req.pipelineId}/runs/${data.runId ?? ""}`),
    };
  }

  if (res.ok) {
    const body = await res.json();
    const data = body?.data ?? {};
    if (data.error) return { kind: "failed", error: String(data.error) };
    return {
      kind: "completed",
      runId: String(data.runId ?? ""),
      status: String(data.status ?? "unknown"),
      durationMs: Number(data.durationMs ?? 0),
    };
  }

  // Let the caller handle non-2xx; api() in this app throws ApiError on non-ok.
  const body = await res.json().catch(() => ({}));
  throw new Error(body?.error ?? `HTTP ${res.status}`);
}
