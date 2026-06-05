import { useState, useCallback, useEffect } from 'react';
import { ChainEditor } from './ChainEditor';
import styles from '../SettingsView.module.css';

interface OrchConfig {
  intents: Array<{
    name: string;
    triggers: string[];
    chain: Array<{
      step: string;
      skill?: string;
      prompt: string;
      gates: Array<{ type: string }>;
      retry: number;
      wait_for_user?: boolean;
    }>;
  }>;
}

interface ChainEditorModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (config: OrchConfig) => void;
  initialValue: OrchConfig;
  availableSkills: string[];
  disabled?: boolean;
}

export function ChainEditorModal({
  open,
  onClose,
  onSave,
  initialValue,
  availableSkills,
  disabled,
}: ChainEditorModalProps) {
  const [draft, setDraft] = useState<OrchConfig>(initialValue);

  // Reset draft when modal opens with new initialValue
  useEffect(() => {
    if (open) {
      setDraft(structuredClone(initialValue));
    }
  }, [open, initialValue]);

  const handleSave = useCallback(() => {
    onSave(draft);
    onClose();
  }, [draft, onSave, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const intents = draft?.intents || [];
  const totalSteps = intents.reduce((sum, it) => sum + (it.chain?.length || 0), 0);
  const totalTriggers = intents.reduce((sum, it) => sum + (it.triggers?.length || 0), 0);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: '96vw',
          maxWidth: 1400,
          height: '94vh',
          background: 'var(--surface-1)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--r-lg)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid var(--glass-border)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-0)', letterSpacing: '-0.3px' }}>
              Orchestration Editor
            </h2>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{
                fontSize: 11,
                color: 'var(--text-2)',
                background: 'var(--surface-2)',
                padding: '3px 10px',
                borderRadius: 99,
                fontFamily: 'var(--font-mono)',
              }}>
                {intents.length} intent{intents.length !== 1 ? 's' : ''}
              </span>
              {totalSteps > 0 && (
                <span style={{
                  fontSize: 11,
                  color: 'var(--text-2)',
                  background: 'var(--surface-2)',
                  padding: '3px 10px',
                  borderRadius: 99,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {totalSteps} step{totalSteps !== 1 ? 's' : ''}
                </span>
              )}
              {totalTriggers > 0 && (
                <span style={{
                  fontSize: 11,
                  color: 'var(--text-2)',
                  background: 'var(--surface-2)',
                  padding: '3px 10px',
                  borderRadius: 99,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {totalTriggers} trigger{totalTriggers !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={onClose}
            style={{ padding: '6px 12px', fontSize: 18, lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* ── Legend bar ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            padding: '8px 24px',
            borderBottom: '1px solid var(--glass-border)',
            fontSize: 11,
            color: 'var(--text-3)',
            flexShrink: 0,
            background: 'var(--surface-2)',
          }}
        >
          <span>💡 <strong>PATH A</strong> = intent matched → steps execute in order</span>
          <span style={{ color: 'var(--glass-border)' }}>|</span>
          <span>💡 <strong>PATH B</strong> = intent matched + empty chain → standard LLM with context</span>
          <span style={{ color: 'var(--glass-border)' }}>|</span>
          <span>💡 <strong>PATH C</strong> = no match → standard LLM</span>
        </div>

        {/* ── Body (scrollable) ── */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 28px',
          }}
        >
          <ChainEditor
            value={draft}
            onChange={setDraft}
            availableSkills={availableSkills}
            disabled={disabled}
          />
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            borderTop: '1px solid var(--glass-border)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
            Changes are only saved when you click <strong>Save & Close</strong>
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnOutline}`}
              onClick={onClose}
              disabled={disabled}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnAccent}`}
              onClick={handleSave}
              disabled={disabled}
              style={{ padding: '9px 28px' }}
            >
              Save & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
