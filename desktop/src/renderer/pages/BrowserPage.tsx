import { useState } from 'react';

const SCREENSHOT_DELAY_MS = 1500;

export function BrowserPage() {
  const [url, setUrl] = useState('');
  const [viewportId, setViewportId] = useState<string | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    if (!url || viewportId) return;
    setError(null);
    setScreenshot(null);
    try {
      const result = await window.api.browser.open('manual', url);
      setViewportId(result.viewportId);
      setTimeout(async () => {
        try {
          const png = await window.api.browser.screenshot(result.viewportId);
          setScreenshot(png);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }, SCREENSHOT_DELAY_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleClose() {
    if (!viewportId) return;
    try {
      await window.api.browser.close(viewportId);
    } finally {
      setViewportId(null);
      setScreenshot(null);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Browser</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          style={{ flex: 1, padding: 8, fontSize: 14 }}
        />
        <button
          type="button"
          onClick={handleOpen}
          disabled={!url || !!viewportId}
          style={{ padding: '8px 16px' }}
        >
          Open
        </button>
        <button
          type="button"
          onClick={handleClose}
          disabled={!viewportId}
          style={{ padding: '8px 16px' }}
        >
          Close
        </button>
      </div>
      {error && (
        <div role="alert" style={{ color: '#b00020', marginBottom: 16 }}>
          {error}
        </div>
      )}
      {screenshot && (
        <img
          src={`data:image/png;base64,${screenshot}`}
          alt="browser screenshot"
          style={{ maxWidth: '100%', border: '1px solid #ddd' }}
        />
      )}
    </div>
  );
}
