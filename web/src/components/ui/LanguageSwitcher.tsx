import { useTranslation } from 'react-i18next';
import s from './LanguageSwitcher.module.css';

const LANGS = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'EN' },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language.startsWith('zh') ? 'zh' : 'en';

  return (
    <div className={s.group}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          className={`${s.btn}${current === l.code ? ` ${s.active}` : ''}`}
          onClick={() => i18n.changeLanguage(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
