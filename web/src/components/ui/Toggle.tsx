import s from './Toggle.module.css';

interface Props {
  on: boolean;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
}

export function Toggle({ on, onClick, ariaLabel, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      className={`${s.toggle}${on ? ` ${s.on}` : ''}${className ? ` ${className}` : ''}`}
      onClick={onClick}
    />
  );
}
