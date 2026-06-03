import { useState, useCallback } from 'react';
import { IconEye, IconEyeOff } from './chat/icons';
import { IconCopy, IconCheck } from './chat/icons';
import styles from './SensitiveField.module.css';

interface SensitiveFieldProps {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  hideCopy?: boolean;
  disabled?: boolean;
  className?: string;
}

export function SensitiveField({ value, onChange, placeholder, hideCopy, disabled, className }: SensitiveFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const readOnly = !onChange;

  const handleCopy = useCallback(() => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [value]);

  const toggleReveal = useCallback(() => setRevealed((r) => !r), []);

  return (
    <div className={`${styles.wrapper} ${className || ''}`}>
      {readOnly ? (
        <div className={styles.display}>
          {revealed ? (value || '—') : (value ? '•'.repeat(Math.min(value.length, 24)) : '—')}
        </div>
      ) : (
        <input
          className={styles.input}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
        />
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={toggleReveal}
          tabIndex={-1}
          aria-label={revealed ? 'Hide' : 'Show'}
        >
          {revealed ? <IconEyeOff /> : <IconEye />}
        </button>
        {!hideCopy && (
          <button
            type="button"
            className={`${styles.iconBtn} ${copied ? styles.iconBtnCopied : ''}`}
            onClick={handleCopy}
            tabIndex={-1}
            aria-label="Copy"
          >
            {copied ? <IconCheck /> : <IconCopy />}
          </button>
        )}
      </div>
    </div>
  );
}
