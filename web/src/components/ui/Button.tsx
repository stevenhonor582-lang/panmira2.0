import type { ButtonHTMLAttributes, ReactNode } from 'react';
import s from './Button.module.css';

type Variant = 'accent' | 'gradient' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'iconSm';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({ variant = 'accent', size = 'md', className, children, ...rest }: Props) {
  return (
    <button
      className={`${s.base} ${s[variant]} ${s[size]}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
