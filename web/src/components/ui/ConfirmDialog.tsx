import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import s from './ConfirmDialog.module.css';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();

  if (!open) return null;

  return createPortal(
    <div className={s.overlay} onClick={onCancel}>
      <div className={s.dialog} onClick={(e) => e.stopPropagation()}>
        <h3 className={s.title}>{title}</h3>
        <p className={s.message}>{message}</p>
        <div className={s.actions}>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel ?? t('common.cancel', '取消')}
          </Button>
          <Button variant={variant === 'danger' ? 'danger' : 'accent'} size="sm" onClick={onConfirm}>
            {confirmLabel ?? t('common.confirm', '确认')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
