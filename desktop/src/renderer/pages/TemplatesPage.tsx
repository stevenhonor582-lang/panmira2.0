import { useEffect, useState } from 'react';
import type { TemplateSummary } from '../../shared/ipc-contract.js';

export function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.api.templates
      .list()
      .then((list) => {
        if (!cancelled) setTemplates(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onRun = async (id: string) => {
    setError(null);
    setRunning(id);
    try {
      const result = await window.api.templates.run({ templateId: id, params: {} });
      // v0.2.1 will render the result in a side panel
      // eslint-disable-next-line no-console
      console.log('[templates] result', result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>Templates</h1>
      <p style={{ color: '#666' }}>Pre-built B2B sales workflows.</p>

      {error && (
        <div role="alert" style={{ color: 'red', marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16
        }}
      >
        {templates.map((t) => {
          const isRunning = running === t.id;
          return (
            <div
              key={t.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: 16,
                background: '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}
            >
              <h3 style={{ margin: 0 }}>{t.name}</h3>
              <p style={{ color: '#555', fontSize: 14, margin: 0 }}>{t.description}</p>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 8
                }}
              >
                <span style={{ fontSize: 12, color: '#888' }}>
                  ~{t.estimatedDurationSec}s · {t.category}
                </span>
                <button onClick={() => onRun(t.id)} disabled={isRunning}>
                  {isRunning ? 'Running…' : 'Run'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
