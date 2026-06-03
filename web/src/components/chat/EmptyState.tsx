/* ---- Empty State (shown when no messages) ---- */

import { useTranslation } from 'react-i18next';
import styles from '../ChatView.module.css';

interface Props {
  onHintClick: (text: string) => void;
  botName?: string | null;
  botDescription?: string;
}

export function EmptyState({ onHintClick, botName, botDescription }: Props) {
  const { t } = useTranslation();
  const displayName = botName || 'PanMira';
  const initial = displayName.charAt(0).toUpperCase();
  const description = botDescription || t('empty.defaultDescription');

  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>
        <div className={styles.emptyIconInner}>{initial}</div>
      </div>
      <div className={styles.emptyTitle}>{displayName}</div>
      <div className={styles.emptySubtitle}>{description}</div>
      <div className={styles.emptyHints}>
        {[
          t('empty.hint1'),
          t('empty.hint2'),
          t('empty.hint3'),
          t('empty.hint4'),
        ].map((hint) => (
          <button
            key={hint}
            className={styles.emptyHint}
            onClick={() => onHintClick(hint)}
          >
            {hint}
          </button>
        ))}
      </div>
    </div>
  );
}
