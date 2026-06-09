import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { requestNotificationPermission } from '../utils/notifications';
import { Button, Input } from './ui';
import { ParticleNetwork } from './login/ParticleNetwork';
import styles from './login/LoginPage.module.css';

type AuthMode = 'login' | 'token';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
  const { t } = useTranslation();
  const login = useStore((s) => s.login);
  const loginWithEmail = useStore((s) => s.loginWithEmail);
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setError(t('login.invalidEmail'));
      return;
    }
    if (password.length < 6) {
      setError(t('login.passwordMinLength'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      showToast(t('login.success'), 'success');
      requestNotificationPermission();
    } catch (err: any) {
      const msg = err.message || t('login.authFailed');
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleTokenSubmit(e: FormEvent) {
    e.preventDefault();
    const token = tokenInput.trim();
    if (!token) { setError(t('login.enterToken')); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/status', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { login(token); requestNotificationPermission(); }
      else if (res.status === 401 || res.status === 403) setError(t('login.tokenInvalid'));
      else login(token);
    } catch {
      login(token);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <ParticleNetwork />
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.logoMark}>P</div>
          <div className={styles.logoType}>PanMira</div>
        </div>
        <p className={styles.tagline}>AI Super Assistant Platform</p>
        <div className={styles.divider}>
          {mode === 'login' ? t('login.accountLogin') : t('login.tokenConnect')}
        </div>

        {mode === 'login' ? (
          <form className={styles.form} onSubmit={handleEmailSubmit}>
            <Input
              label={t('login.email')} type="email"
              placeholder="you@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email"
            />
            <Input
              label={t('login.password')} type="password"
              placeholder="••••••••" value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            {error && <div className={styles.error}>{error}</div>}
            <Button type="submit" variant="gradient" size="lg" disabled={loading || !email || !password}>
              {loading ? t('login.verifying') : t('login.login')}
            </Button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={handleTokenSubmit}>
            <Input
              label={t('login.apiToken')} type="password" mono
              placeholder={t('login.enterKey')} value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)} autoFocus autoComplete="off" spellCheck={false}
            />
            {error && <div className={styles.error}>{error}</div>}
            <Button type="submit" variant="gradient" size="lg" disabled={loading || !tokenInput.trim()}>
              {loading ? t('login.connecting') : t('login.connect')}
            </Button>
          </form>
        )}

        <div className={styles.modeLinks}>
          <button className={styles.modeLink} onClick={() => { setMode(mode === 'login' ? 'token' : 'login'); setError(''); }}>
            {mode === 'login' ? t('login.apiTokenLogin') : t('login.emailLogin')}
          </button>
        </div>

        <div className={styles.footer}>
          Powered by{' '}
          <a href="https://github.com/anthropics/claude-code" target="_blank" rel="noopener noreferrer">
            Claude Code
          </a>
        </div>
      </div>
    </div>
  );
}
