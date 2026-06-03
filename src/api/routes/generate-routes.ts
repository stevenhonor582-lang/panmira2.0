import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type * as http from 'node:http';
import {
  resolveMiniMaxApiKey,
  minimaxImageGenerate,
  minimaxSpeechGenerate,
  minimaxMusicGenerate,
} from '../minimax-generate.js';
import { jsonResponse, parseJsonBody } from './helpers.js';
import type { RouteContext } from './types.js';

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export async function handleGenerateRoutes(
  ctx: RouteContext,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  method: string,
  url: string,
): Promise<boolean> {
  if (!ctx.providerConfigStore) return false;

  // POST /api/generate/image
  if (method === 'POST' && url === '/api/generate/image') {
    const body = await parseJsonBody(req);
    const prompt = body.prompt as string;
    if (!prompt) {
      jsonResponse(res, 400, { error: 'Missing required field: prompt' });
      return true;
    }

    const apiKey = await resolveMiniMaxApiKey(ctx.providerConfigStore);
    const result = await minimaxImageGenerate(apiKey, prompt, {
      model: (body.model as string) || undefined,
      aspectRatio: (body.aspectRatio as string) || undefined,
    });
    jsonResponse(res, 200, { ok: true, imageUrl: result.imageUrl });
    return true;
  }

  // POST /api/generate/speech
  if (method === 'POST' && url === '/api/generate/speech') {
    const body = await parseJsonBody(req);
    const text = body.text as string;
    if (!text) {
      jsonResponse(res, 400, { error: 'Missing required field: text' });
      return true;
    }

    const apiKey = await resolveMiniMaxApiKey(ctx.providerConfigStore);
    const audioBuffer = await minimaxSpeechGenerate(apiKey, text, {
      model: (body.model as string) || undefined,
      voiceId: (body.voiceId as string) || undefined,
      speed: (body.speed as number) || undefined,
    });

    const chatId = (body.chatId as string) || 'default';
    const outDir = path.join(os.tmpdir(), 'panmira-uploads', chatId);
    ensureDir(outDir);
    const filename = `speech-${Date.now()}.mp3`;
    fs.writeFileSync(path.join(outDir, filename), audioBuffer);

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
      'X-Filename': filename,
    });
    res.end(audioBuffer);
    return true;
  }

  // POST /api/generate/music
  if (method === 'POST' && url === '/api/generate/music') {
    const body = await parseJsonBody(req);
    const prompt = body.prompt as string;
    if (!prompt) {
      jsonResponse(res, 400, { error: 'Missing required field: prompt' });
      return true;
    }

    const apiKey = await resolveMiniMaxApiKey(ctx.providerConfigStore);
    const result = await minimaxMusicGenerate(apiKey, prompt, {
      model: (body.model as string) || undefined,
      lyrics: (body.lyrics as string) || undefined,
      duration: (body.duration as number) || undefined,
    });

    if (result.audioUrl) {
      jsonResponse(res, 200, { ok: true, audioUrl: result.audioUrl });
      return true;
    }

    const audioBuffer = result.audioBuffer!;
    const chatId = (body.chatId as string) || 'default';
    const outDir = path.join(os.tmpdir(), 'panmira-uploads', chatId);
    ensureDir(outDir);
    const filename = `music-${Date.now()}.mp3`;
    fs.writeFileSync(path.join(outDir, filename), audioBuffer);

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
      'X-Filename': filename,
    });
    res.end(audioBuffer);
    return true;
  }

  return false;
}
