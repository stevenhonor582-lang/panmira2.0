import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { LanguageSwitcher } from '../ui';
import styles from '../SettingsView.module.css';

export function SystemSection() {
  const { t } = useTranslation();
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const fontSize = useStore((s) => s.fontSize);
  const setFontSize = useStore((s) => s.setFontSize);
  const connected = useStore((s) => s.connected);
  const sessions = useStore((s) => s.sessions);
  const clearSessions = useStore((s) => s.clearSessions);

  return (
    <>
      <h2 className={styles.contentTitle}>{t('system.title')}</h2>

      <h3 className={styles.contentSubTitle}>{t('system.appearance')}</h3>
      <div className={styles.card}>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('system.darkMode')}</span>
            <span className={styles.cardItemDesc}>{t('system.darkModeDesc')}</span>
          </div>
          <button className={`${styles.toggle} ${theme === 'dark' ? styles.toggleOn : ''}`} onClick={toggleTheme} aria-label="Toggle theme" />
        </div>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('system.fontSize')}</span>
            <span className={styles.cardItemDesc}>{t('system.fontSizeDesc')}</span>
          </div>
          <div className={styles.fontSizeGroup}>
            {(['small', 'normal', 'large', 'xl'] as const).map((size) => (
              <button key={size} className={`${styles.fontSizeBtn} ${fontSize === size ? styles.fontSizeBtnActive : ''}`} onClick={() => setFontSize(size)}>
                {{ small: 'S', normal: 'M', large: 'L', xl: 'XL' }[size]}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('system.language', '语言')}</span>
          </div>
          <LanguageSwitcher />
        </div>
      </div>

      <h3 className={styles.contentSubTitle}>{t('system.connection')}</h3>
      <div className={styles.card}>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('system.serverStatus')}</span>
            <span className={styles.cardItemDesc}>{t('system.serverStatusDesc')}</span>
          </div>
          <span className={`${styles.connBadge} ${connected ? styles.connBadgeOnline : styles.connBadgeOffline}`}>
            <span className={`${styles.connDot} ${connected ? styles.connDotOn : styles.connDotOff}`} />
            {connected ? t('system.connected') : t('system.disconnected')}
          </span>
        </div>
      </div>

      <h3 className={styles.contentSubTitle}>{t('system.data')}</h3>
      <div className={styles.card}>
        <div className={styles.cardItem}>
          <div className={styles.cardItemLeft}>
            <span className={styles.cardItemLabel}>{t('system.chatHistory')}</span>
            <span className={styles.cardItemDesc}>{t('system.localSessions', { count: sessions.size })}</span>
          </div>
          <button className={`${styles.btn} ${styles.btnDanger}`} onClick={() => { if (window.confirm(t('system.clearConfirm'))) clearSessions(); }}>
            {t('system.clearAll')}
          </button>
        </div>
      </div>

      <div className={styles.version}>
        {t('system.version')}{' '}
        <a href="https://github.com/anthropics/claude-code" target="_blank" rel="noopener noreferrer">Claude Code</a>
      </div>
    </>
  );
}
