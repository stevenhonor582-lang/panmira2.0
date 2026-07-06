export type KBType = "industry" | "product" | "competitor" | "solution" | "pricing" | "company" | "department" | "personal";
export type KBVisibility = "private" | "team" | "company";
export type KBIndexStatus = "pending" | "indexing" | "ready" | "failed";

export interface KnowledgeBase {
  id: string;
  tenantId: string;
  teamId: string | null;
  ownerUserId: string | null;
  type: KBType;
  name: string;
  description: string;
  visibility: KBVisibility;
  embeddingProviderId: string | null;
  chunkSize: number;
  chunkOverlap: number;
  indexStatus: KBIndexStatus;
  documentCount: number;
  chunkCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KBCreate {
  name: string;
  type: KBType;
  description?: string;
  visibility?: KBVisibility;
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface KBDocument {
  id: string;
  title: string;
  folderId?: string;
  path?: string;
  content: string;
  tags?: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KBSearchHit {
  chunkId?: string;
  documentId?: string;
  content?: string;
  score?: number;
  title?: string;
  metadata?: Record<string, unknown>;
}

// 标准 ApiResponse<T> 信封
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
}
