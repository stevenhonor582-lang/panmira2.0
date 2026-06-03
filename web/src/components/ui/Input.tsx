import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';
import s from './Input.module.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  mono?: boolean;
  large?: boolean;
}

export function Input({ label, error, mono, large, className, id, ...rest }: InputProps) {
  const inputId = id || label?.replace(/\s+/g, '-').toLowerCase();
  return (
    <div className={s.field}>
      {label && <label className={s.label} htmlFor={inputId}>{label}</label>}
      <input
        id={inputId}
        className={`${s.input}${mono ? ` ${s.mono}` : ''}${large ? ` ${s.lg}` : ''}${className ? ` ${className}` : ''}`}
        {...rest}
      />
      {error && <span className={s.error}>{error}</span>}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, id, ...rest }: TextareaProps) {
  const inputId = id || label?.replace(/\s+/g, '-').toLowerCase();
  return (
    <div className={s.field}>
      {label && <label className={s.label} htmlFor={inputId}>{label}</label>}
      <textarea
        id={inputId}
        className={`${s.textarea}${className ? ` ${className}` : ''}`}
        {...rest}
      />
      {error && <span className={s.error}>{error}</span>}
    </div>
  );
}

interface FieldProps {
  label?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, error, children }: FieldProps) {
  return (
    <div className={s.field}>
      {label && <span className={s.label}>{label}</span>}
      {children}
      {error && <span className={s.error}>{error}</span>}
    </div>
  );
}
