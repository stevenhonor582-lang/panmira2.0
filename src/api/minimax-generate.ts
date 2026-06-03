import type { ProviderConfigStore } from '../db/provider-config-store.js';
import { proxyFetch } from '../utils/http.js';

const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1';

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

export async function resolveMiniMaxApiKey(store: ProviderConfigStore): Promise<string> {
  const prov = await store.findByName('MiniMax');
  if (!prov)
    throw Object.assign(new Error('MiniMax provider not found. Add it in Settings > AI Providers.'), {
      statusCode: 400,
    });
  const apiKey = await store.getDecryptedApiKey(prov.id);
  if (!apiKey) throw Object.assign(new Error('MiniMax API key not configured'), { statusCode: 400 });
  return apiKey;
}

export async function minimaxImageGenerate(
  apiKey: string,
  prompt: string,
  opts?: { model?: string; aspectRatio?: string },
): Promise<{ imageUrl: string }> {
  const res = await proxyFetch(`${MINIMAX_BASE_URL}/image_generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts?.model || 'image-01',
      prompt,
      ...(opts?.aspectRatio ? { aspect_ratio: opts.aspectRatio } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MiniMax image generation failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as any;
  const imageUrl = data?.data?.image_urls?.[0] || data?.data?.image_url;
  if (!imageUrl) throw new Error('MiniMax returned no image URL');
  return { imageUrl };
}

export async function minimaxSpeechGenerate(
  apiKey: string,
  text: string,
  opts?: { model?: string; voiceId?: string; speed?: number },
): Promise<Buffer> {
  const res = await proxyFetch(`${MINIMAX_BASE_URL}/t2a_v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts?.model || 'speech-02-hd',
      stream: false,
      text,
      voice_setting: { voice_id: opts?.voiceId || 'male-qn-qingse' },
      audio_setting: { sample_rate: 32000, format: 'mp3' },
      ...(opts?.speed ? { speed: opts.speed } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MiniMax speech generation failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as any;
  const audioField = data?.data?.audio;
  if (!audioField) {
    throw new Error(`MiniMax returned no audio data: ${JSON.stringify(data).slice(0, 200)}`);
  }
  if (typeof audioField === 'string' && /^[0-9a-f]+$/i.test(audioField)) {
    return hexToBuffer(audioField);
  }
  return Buffer.from(audioField, 'base64');
}

export async function minimaxMusicGenerate(
  apiKey: string,
  prompt: string,
  opts?: { model?: string; lyrics?: string; duration?: number },
): Promise<{ audioUrl?: string; audioBuffer?: Buffer }> {
  const res = await proxyFetch(`${MINIMAX_BASE_URL}/music_generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts?.model || 'music-2.5',
      prompt,
      lyrics: opts?.lyrics || '[Instrumental]',
      audio_setting: { sample_rate: 44100, bitrate: 256000, format: 'mp3' },
      output_format: 'url',
      ...(opts?.duration ? { duration: opts.duration } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MiniMax music generation failed: ${res.status} ${err}`);
  }

  const data = (await res.json()) as any;
  const audioUrl = data?.data?.audio;
  if (!audioUrl) {
    const errMsg = data?.base_resp?.status_msg || JSON.stringify(data).slice(0, 200);
    throw new Error(`MiniMax returned no music data: ${errMsg}`);
  }
  if (audioUrl.startsWith('http')) {
    return { audioUrl };
  }
  const buf = /^[0-9a-f]+$/i.test(audioUrl) ? hexToBuffer(audioUrl) : Buffer.from(audioUrl, 'base64');
  return { audioBuffer: buf };
}
