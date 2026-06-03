// Enums and constants migrated from matebot Python

export enum UserRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

export enum TaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  WAITING = 'WAITING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum MemoryLayer {
  RAW = 0,
  USER = 1,
  AGENT = 2,
  SHARED = 3,
}

export enum CollabRequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum ApprovalAction {
  SEND_MESSAGE = 'SEND_MESSAGE',
  EXTERNAL_API = 'EXTERNAL_API',
  DATA_ACCESS = 'DATA_ACCESS',
}

export enum Intent {
  TASK = 'TASK',
  COLLAB = 'COLLAB',
  QUERY = 'QUERY',
  APPROVAL = 'APPROVAL',
  ADMIN = 'ADMIN',
}

export const EMBEDDING_DIMENSION = 1536;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.6;
