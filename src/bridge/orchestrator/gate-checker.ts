import { execFileSync } from 'node:child_process';
import type { Logger } from '../../utils/logger.js';
import type { GateRule, GateResult, StepResult } from './types.js';

export class GateChecker {
  constructor(private logger: Logger) {}

  async checkAll(rules: GateRule[], stepResult: StepResult, cwd: string): Promise<GateResult[]> {
    const results: GateResult[] = [];
    for (const rule of rules) {
      const start = Date.now();
      try {
        const result = await this.checkOne(rule, cwd);
        result.durationMs = Date.now() - start;
        results.push(result);
        this.logger.info({ gate: rule.type, passed: result.passed, actual: result.actual }, 'Gate check');
      } catch (err: any) {
        results.push({
          passed: false,
          gate: rule.type,
          error: err.message,
          expected: this.describeGate(rule),
          durationMs: Date.now() - start,
        });
      }
    }
    return results;
  }

  private async checkOne(rule: GateRule, cwd: string): Promise<GateResult> {
    const workDir = rule.cwd || cwd;
    switch (rule.type) {
      case 'test_pass':
        return this.checkTestPass(workDir);
      case 'coverage':
        return this.checkCoverage(workDir, rule.threshold || 80);
      case 'lint_pass':
        return this.checkLintPass(workDir);
      case 'typecheck_pass':
        return this.checkTypecheckPass(workDir);
      case 'docker_build_pass':
        return this.checkDockerBuild(workDir);
      case 'health_check':
        return this.checkHealth(rule.endpoint!, rule.expect || 200);
      case 'rollback_available':
        return this.checkRollback(workDir);
      case 'repro_test_exists':
        return this.checkReproTest(workDir);
      default:
        return { passed: false, gate: rule.type, error: `Unknown gate type: ${rule.type}`, durationMs: 0 };
    }
  }

  private checkTestPass(cwd: string): GateResult {
    try {
      execFileSync('npm', ['test'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120_000,
        encoding: 'utf-8',
      });
      return { passed: true, gate: 'test_pass', actual: '所有测试通过', durationMs: 0 };
    } catch (err: any) {
      const stderr = err.stderr || err.message || '';
      return {
        passed: false,
        gate: 'test_pass',
        expected: 'npm test 退出码 = 0',
        actual: stderr.slice(0, 500),
        error: '测试失败',
        durationMs: 0,
      };
    }
  }

  private checkCoverage(cwd: string, threshold: number): GateResult {
    try {
      const result = execFileSync('npx', ['vitest', 'run', '--coverage'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120_000,
        encoding: 'utf-8',
      });

      const coverageMatch = result.match(/([\d.]+)%\s*(Statements|Lines|All files)/i);
      if (coverageMatch) {
        const coverage = parseFloat(coverageMatch[1]);
        return {
          passed: coverage >= threshold,
          gate: 'coverage',
          expected: `覆盖率 >= ${threshold}%`,
          actual: `覆盖率 ${coverage}%`,
          durationMs: 0,
        };
      }

      const pctMatch = result.match(/All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/);
      if (pctMatch) {
        const lines = parseFloat(pctMatch[3]);
        return {
          passed: lines >= threshold,
          gate: 'coverage',
          expected: `覆盖率 >= ${threshold}%`,
          actual: `Lines覆盖率 ${lines}%`,
          durationMs: 0,
        };
      }

      return {
        passed: false,
        gate: 'coverage',
        expected: `覆盖率 >= ${threshold}%`,
        actual: '无法解析覆盖率输出',
        error: '无法解析覆盖率输出',
        durationMs: 0,
      };
    } catch (err: any) {
      return {
        passed: false,
        gate: 'coverage',
        expected: `覆盖率 >= ${threshold}%`,
        actual: (err.stderr || err.message || '').slice(0, 500),
        error: '运行覆盖率检查失败',
        durationMs: 0,
      };
    }
  }

  private checkLintPass(cwd: string): GateResult {
    try {
      execFileSync('npm', ['run', 'lint'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60_000,
        encoding: 'utf-8',
      });
      return { passed: true, gate: 'lint_pass', actual: 'Lint 通过', durationMs: 0 };
    } catch (err: any) {
      return {
        passed: false,
        gate: 'lint_pass',
        expected: 'npm run lint 退出码 = 0',
        actual: (err.stderr || err.message || '').slice(0, 500),
        error: 'Lint 检查失败',
        durationMs: 0,
      };
    }
  }

  private checkTypecheckPass(cwd: string): GateResult {
    try {
      execFileSync('npx', ['tsc', '--noEmit'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60_000,
        encoding: 'utf-8',
      });
      return { passed: true, gate: 'typecheck_pass', actual: '类型检查通过', durationMs: 0 };
    } catch (err: any) {
      return {
        passed: false,
        gate: 'typecheck_pass',
        expected: 'tsc --noEmit 退出码 = 0',
        actual: (err.stdout || err.stderr || '').slice(0, 500),
        error: '类型检查失败',
        durationMs: 0,
      };
    }
  }

  private checkDockerBuild(cwd: string): GateResult {
    try {
      execFileSync('docker', ['build', '.', '--no-cache'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300_000,
        encoding: 'utf-8',
      });
      return { passed: true, gate: 'docker_build_pass', actual: 'Docker 构建成功', durationMs: 0 };
    } catch (err: any) {
      return {
        passed: false,
        gate: 'docker_build_pass',
        expected: 'docker build . 退出码 = 0',
        actual: (err.stderr || err.message || '').slice(0, 500),
        error: 'Docker 构建失败',
        durationMs: 0,
      };
    }
  }

  private async checkHealth(endpoint: string, expect: number): Promise<GateResult> {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
      const passed = res.status === expect;
      return {
        passed,
        gate: 'health_check',
        expected: `GET ${endpoint} → ${expect}`,
        actual: `GET ${endpoint} → ${res.status}`,
        durationMs: 0,
      };
    } catch (err: any) {
      return {
        passed: false,
        gate: 'health_check',
        expected: `GET ${endpoint} → ${expect}`,
        actual: err.message || '请求失败',
        error: '健康检查失败',
        durationMs: 0,
      };
    }
  }

  private checkRollback(cwd: string): GateResult {
    try {
      const result = execFileSync('docker', ['images', '--format', '{{.Tag}}'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
        encoding: 'utf-8',
      });
      const tags = result
        .trim()
        .split('\n')
        .filter((t) => t !== 'latest' && t !== '<none>');
      return {
        passed: tags.length > 0,
        gate: 'rollback_available',
        expected: '存在可回滚的版本 tag',
        actual: tags.length > 0 ? `找到 ${tags.length} 个版本: ${tags.slice(0, 3).join(', ')}` : '未找到可回滚版本',
        durationMs: 0,
      };
    } catch (err: any) {
      return {
        passed: false,
        gate: 'rollback_available',
        expected: '存在可回滚的版本 tag',
        actual: err.message || '检查失败',
        error: '回滚版本检查失败',
        durationMs: 0,
      };
    }
  }

  private checkReproTest(cwd: string): GateResult {
    try {
      const result = execFileSync('git', ['diff', '--name-only', 'HEAD'], {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
        encoding: 'utf-8',
      });
      const changedFiles = result.trim().split('\n');
      const hasTestFile = changedFiles.some(
        (f) => /\.test\.(ts|tsx|js|jsx)$/.test(f) || /\.spec\.(ts|tsx|js|jsx)$/.test(f),
      );
      return {
        passed: hasTestFile,
        gate: 'repro_test_exists',
        expected: '存在复现测试文件',
        actual: hasTestFile ? '找到测试文件' : '未找到测试文件变更',
        durationMs: 0,
      };
    } catch {
      return {
        passed: false,
        gate: 'repro_test_exists',
        expected: '存在复现测试文件',
        actual: '无法检查 git diff',
        error: 'Git 检查失败',
        durationMs: 0,
      };
    }
  }

  private describeGate(rule: GateRule): string {
    switch (rule.type) {
      case 'test_pass':
        return 'npm test 退出码 = 0';
      case 'coverage':
        return `覆盖率 >= ${rule.threshold || 80}%`;
      case 'lint_pass':
        return 'npm run lint 退出码 = 0';
      case 'typecheck_pass':
        return 'tsc --noEmit 退出码 = 0';
      case 'docker_build_pass':
        return 'docker build . 退出码 = 0';
      case 'health_check':
        return `GET ${rule.endpoint} → ${rule.expect || 200}`;
      case 'rollback_available':
        return '回滚版本存在';
      case 'repro_test_exists':
        return '复现测试文件存在';
      default:
        return '';
    }
  }
}
