import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

interface EvidenceMetadata {
  action: string;
  target: string;
  verdict: 'PASS' | 'FAIL';
  userId?: string;
  timestamp: number;
}

export class EvidenceCollector {
  constructor(private config: { outputDir: string }) {}

  async saveScreenshot(png: Buffer, meta: Omit<EvidenceMetadata, 'timestamp'>): Promise<string> {
    await mkdir(this.config.outputDir, { recursive: true });
    const ts = Date.now();
    const filename = `${meta.action}_${meta.target.replace(/[^a-z0-9]/gi, '_')}_${ts}.png`;
    const filepath = join(this.config.outputDir, filename);
    await writeFile(filepath, png);
    await writeFile(filepath + '.json', JSON.stringify({ ...meta, timestamp: ts }, null, 2));
    return filepath;
  }
}
