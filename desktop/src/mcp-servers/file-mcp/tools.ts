import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';

const ALLOWED_ROOTS = [
  resolve(homedir(), 'Documents/Panmira'),
  resolve(homedir(), 'Downloads'),
  tmpdir()
];

function assertSafePath(path: string): string {
  if (!isAbsolute(path)) {
    throw new Error('Path must be absolute');
  }
  const resolved = resolve(path);
  const allowed = ALLOWED_ROOTS.some((root) => resolved.startsWith(root));
  if (!allowed) {
    throw new Error(`Access denied: path not under allowed roots`);
  }
  return resolved;
}

export async function handleFileRead(args: { path: string }): Promise<{ content: string }> {
  const safe = assertSafePath(args.path);
  return { content: await readFile(safe, 'utf-8') };
}

export async function handleFileWrite(
  args: { path: string; content: string }
): Promise<{ bytes: number }> {
  const safe = assertSafePath(args.path);
  await mkdir(dirname(safe), { recursive: true });
  await writeFile(safe, args.content, 'utf-8');
  return { bytes: Buffer.byteLength(args.content, 'utf-8') };
}
