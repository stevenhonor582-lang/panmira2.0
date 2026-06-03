import type { HTMLAttributes, ReactNode } from 'react';
import s from './Card.module.css';

interface Props extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  accentBorder?: boolean;
  padded?: boolean;
  children: ReactNode;
}

export function Card({ hoverable, accentBorder, padded, className, children, ...rest }: Props) {
  return (
    <div
      className={`${s.card}${hoverable ? ` ${s.hoverable}` : ''}${accentBorder ? ` ${s.accentBorder}` : ''}${padded ? ` ${s.pad}` : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`${s.header}${className ? ` ${className}` : ''}`}>{children}</div>;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`${s.title}${className ? ` ${className}` : ''}`}>{children}</span>;
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`${s.body}${className ? ` ${className}` : ''}`}>{children}</div>;
}
