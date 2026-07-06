export type ModelType = "llm" | "embedding";

export interface Model {
  id: string;
  type: ModelType;
  name: string;
  baseUrl: string;
  model: string;
  isDefault: boolean;
  status: string;
  createdAt: string;
}

export interface ModelInput {
  type: ModelType;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  isDefault?: boolean;
}

export interface ModelListResponse {
  models: Model[];
}
