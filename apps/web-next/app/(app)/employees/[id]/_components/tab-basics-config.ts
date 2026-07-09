export interface ModelBindingProvider {
  id: string;
  name: string;
  model: string;
  type: string;
}

export type ModelBindingPatch = {
  default_engine?: string;
  default_model?: string;
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
  selectedProvider: ModelBindingProvider;
  currentProvider: ModelBindingProvider | null;
  useModelRouting: boolean;
  orchestration: Record<string, unknown> | null | undefined;
}): ModelBindingPatch {
  const patch: ModelBindingPatch = {
    orchestration: { ...(orchestration ?? {}), useModelRouting },
  };

  if (selectedProvider.id !== currentProvider?.id) {
    patch.default_engine = engineFromProvider(selectedProvider);
    patch.default_model = selectedProvider.model;
  }

  return patch;
}
