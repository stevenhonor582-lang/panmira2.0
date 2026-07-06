export interface AuditLog {
  id?: string;
  actor?: string;
  action?: string;
  resource?: string;
  ip?: string;
  created_at?: string;
  [k: string]: unknown;
}

export interface AuditResponse {
  logs: AuditLog[];
}
