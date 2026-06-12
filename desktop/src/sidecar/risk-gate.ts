interface QualityLike {
  review: (req: { action: string; target: string }) => Promise<{ verdict: 'PASS' | 'FAIL'; issues: string[] }>;
}

type ConfirmFn = (prompt: string) => Promise<boolean>;

export class RiskGate {
  constructor(
    private quality: QualityLike,
    private confirm: ConfirmFn
  ) {}

  async guard<T>(
    request: { action: 'browser_login' | 'browser_publish' | 'browser_payment'; target: string },
    action: () => Promise<T>
  ): Promise<T> {
    // 第一道：质检
    const review = await this.quality.review(request);
    if (review.verdict === 'FAIL') {
      throw new Error(`Quality check failed: ${review.issues.join(', ')}`);
    }

    // 第二道：人工确认
    const prompt = `即将执行：${request.action} → ${request.target}\n确认继续？`;
    const approved = await this.confirm(prompt);
    if (!approved) {
      throw new Error('User denied the action');
    }

    return action();
  }
}
