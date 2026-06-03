import type { HTMLAttributes, ReactNode } from 'react';
import s from './Badge.module.css';

type Variant = 'default' | 'accent' | 'success' | 'danger' | 'warning' | 'info';

interface Props extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  large?: boolean;
  children: ReactNode;
}

export function Badge({ variant = 'default', large, className, children, ...rest }: Props) {
  return (
    <span
      className={`${s.badge} ${s[variant]}${large ? ` ${s.lg}` : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </span>
  );
}
