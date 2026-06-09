export interface ProviderTemplate {
  name: string;
  baseUrl: string;
  defaultModel: string;
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  { name: '智谱 (GLM)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4-flash' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { name: 'MiniMax', baseUrl: 'https://api.minimax.io/v1', defaultModel: 'MiniMax-M2.7' },
];

export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  type: 'LLM' | 'voice' | 'image' | 'video' | 'embedding';
  workDir?: string;
}
