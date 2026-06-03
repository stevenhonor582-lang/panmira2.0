export type ClarificationErrorCode =
  | 'SCHEMA_NOT_FOUND'
  | 'CARD_SEND_FAILED'
  | 'SESSION_LOST'
  | 'LLM_FALLBACK_FAILED'
  | 'DB_ERROR';

export class ClarificationError extends Error {
  public readonly code: ClarificationErrorCode;
  public readonly recoverable: boolean;
  public readonly cause?: unknown;

  constructor(
    code: ClarificationErrorCode,
    message: string,
    recoverable: boolean = true,
    cause?: unknown
  ) {
    super(message);
    this.name = 'ClarificationError';
    this.code = code;
    this.recoverable = recoverable;
    this.cause = cause;
  }
}

export function isClarificationError(err: unknown): err is ClarificationError {
  return err instanceof ClarificationError;
}
