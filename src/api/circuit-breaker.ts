import type { Logger } from '../utils/logger.js';
import { pool } from '../db/index.js';

type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
}

interface BotCircuit {
  state: CircuitState;
  failures: number;
  lastFailure: number;
  halfOpenSuccesses: number;
}

export class CircuitBreaker {
  private circuits = new Map<string, BotCircuit>();
  private config: CircuitConfig;
  private logger: Logger;

  constructor(logger: Logger, config?: Partial<CircuitConfig>) {
    this.logger = logger.child({ module: 'circuit-breaker' });
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      resetTimeoutMs: config?.resetTimeoutMs ?? 60_000,
      halfOpenMaxAttempts: config?.halfOpenMaxAttempts ?? 2,
    };
  }

  async init(): Promise<void> {
    try {
      const { rows } = await pool.query('SELECT * FROM circuit_breaker_states');
      for (const r of rows) {
        this.circuits.set(r.bot_name, {
          state: r.state as CircuitState,
          failures: r.failures,
          lastFailure: Number(r.last_failure),
          halfOpenSuccesses: r.half_open_successes,
        });
      }
      if (rows.length > 0) {
        this.logger.info({ restored: rows.length }, 'Circuit breaker states restored from DB');
      }
    } catch {
      /* table may not exist yet */
    }
  }

  private getCircuit(botName: string): BotCircuit {
    let circuit = this.circuits.get(botName);
    if (!circuit) {
      circuit = { state: 'closed', failures: 0, lastFailure: 0, halfOpenSuccesses: 0 };
      this.circuits.set(botName, circuit);
    }
    return circuit;
  }

  private persist(botName: string): void {
    const c = this.circuits.get(botName);
    if (!c) return;
    pool
      .query(
        `INSERT INTO circuit_breaker_states (bot_name, state, failures, last_failure, half_open_successes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (bot_name) DO UPDATE SET state = $2, failures = $3, last_failure = $4, half_open_successes = $5, updated_at = $6`,
        [botName, c.state, c.failures, c.lastFailure, c.halfOpenSuccesses, Date.now()],
      )
      .catch(() => {});
  }

  isAvailable(botName: string): boolean {
    const circuit = this.getCircuit(botName);
    if (circuit.state === 'closed') return true;
    if (circuit.state === 'open') {
      if (Date.now() - circuit.lastFailure >= this.config.resetTimeoutMs) {
        circuit.state = 'half-open';
        circuit.halfOpenSuccesses = 0;
        this.logger.info({ botName }, 'Circuit half-open, allowing probe request');
        this.persist(botName);
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess(botName: string): void {
    const circuit = this.getCircuit(botName);
    if (circuit.state === 'half-open') {
      circuit.halfOpenSuccesses++;
      if (circuit.halfOpenSuccesses >= this.config.halfOpenMaxAttempts) {
        circuit.state = 'closed';
        circuit.failures = 0;
        this.logger.info({ botName }, 'Circuit closed (recovered)');
      }
    } else if (circuit.state === 'closed') {
      circuit.failures = 0;
    }
    this.persist(botName);
  }

  recordFailure(botName: string): void {
    const circuit = this.getCircuit(botName);
    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.state === 'half-open') {
      circuit.state = 'open';
      this.logger.warn({ botName, failures: circuit.failures }, 'Circuit re-opened (half-open probe failed)');
    } else if (circuit.failures >= this.config.failureThreshold) {
      circuit.state = 'open';
      this.logger.warn({ botName, failures: circuit.failures }, 'Circuit opened (threshold reached)');
    }
    this.persist(botName);
  }

  getStatus(): Record<string, { state: CircuitState; failures: number }> {
    const status: Record<string, { state: CircuitState; failures: number }> = {};
    for (const [name, circuit] of this.circuits) {
      status[name] = { state: circuit.state, failures: circuit.failures };
    }
    return status;
  }

  reset(botName: string): void {
    this.circuits.delete(botName);
    pool.query('DELETE FROM circuit_breaker_states WHERE bot_name = $1', [botName]).catch(() => {});
    this.logger.info({ botName }, 'Circuit manually reset');
  }
}
