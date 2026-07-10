export interface ModelBindingProvider {
  id: string;
  name: string;
  model: string;
  type: string;
}

export type ModelBindingPatch = {
  default_engine?: string;
  default_model?: string;
  model_id?: string;
  orchestration: Record<string, unknown>;
};

export function engineFromProvider(p: Pick<ModelBindingProvider, 'name' | 'type'>): string {
  const t = (p.type || '').toLowerCase();
  if (t === 'anthropic' || /claude/i.test(p.name)) return 'claude';
  if (t === 'openai') return 'openai';
  if (t === 'glm' || t === 'zhipu') return 'glm';
  if (t === 'minimax') return 'minimax';
  if (t === 'deepseek') return 'deepseek';
  return t || 'openai';
}

export function readUseModelRouting(orchestration: Record<string, unknown> | null | undefined): boolean {
  return typeof orchestration?.useModelRouting === 'boolean'
    ? (orchestration.useModelRouting as boolean)
    : true;
}

export function buildModelBindingPatch({
  selectedProvider,
  currentProvider,
  useModelRouting,
  orchestration,
}: {
  selectedProvider: ModelBindingProvider | null;
  currentProvider: ModelBindingProvider | null;
  useModelRouting: boolean;
  orchestration: Record<string, unknown> | null | undefined;
}): ModelBindingPatch {
  const patch: ModelBindingPatch = {
    orchestration: { ...(orchestration ?? {}), useModelRouting },
  };

  if (selectedProvider && selectedProvider.id !== currentProvider?.id) {
    patch.default_engine = engineFromProvider(selectedProvider);
    patch.default_model = selectedProvider.model;
  }

  return patch;
}

export const CONTEXT_PRESETS = [
  { value: 32000, label: '32K · 轻量客服' },
  { value: 64000, label: '64K · 通用平衡' },
  { value: 128000, label: '128K · 长文分析' },
  { value: 200000, label: '200K · 全量记忆' },
  { value: 512000, label: '512K · M3 长上下文' },
] as const;

export function nextSelectedProviderIdOnBindingRefresh({
  selectedId,
  currentBindingId,
  lastSyncedBindingId,
}: {
  selectedId: string | null;
  currentBindingId: string | null;
  lastSyncedBindingId: string | null;
}): string | null {
  if (selectedId === null) return currentBindingId;
  if (selectedId === lastSyncedBindingId) return currentBindingId;
  return selectedId;
}
