import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './ReportsView.module.css';

const DIMS = ['token', 'skill', 'mcp', 'channel', 'knowledge'];

async function fetchJSON(url: string, token: string | null): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function ReportsView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [dim, setDim] = useState('token');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchJSON(`/api/v2/admin/reports/${dim}?from=${sevenDaysAgo()}&to=${today()}&groupBy=day`, token)
      .then(setData).catch(() => setData(null));
  }, [dim, token]);

  return (
    <div className={s.root}>
      <h1 className={s.title}>{t('reports.title')}</h1>
      <div className={s.tabs}>
        {DIMS.map((d) => (
          <button key={d} className={dim === d ? `${s.tab} ${s.tabActive}` : s.tab} onClick={() => setDim(d)}>
            {t(`reports.${d}`)}
          </button>
        ))}
      </div>
      <button className={s.exportBtn} onClick={() => exportCSV(dim, token)}>
        {t('reports.exportCsv')}
      </button>
      <table className={s.table}>
        <thead>
          <tr><th>{t('reports.colDate')}</th><th>{t('reports.colCount')}</th></tr>
        </thead>
        <tbody>
          {data?.rows?.map((r: any, i: number) => (
            <tr key={i}>
              <td>{r.date || r.day || '—'}</td>
              <td className={s.mono}>{r.count?.toLocaleString() || r.count || 0}</td>
            </tr>
          ))}
          {(!data?.rows || data.rows.length === 0) && (
            <tr><td colSpan={2} className={s.empty}>{t('reports.noData')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function sevenDaysAgo(): string {
  const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10);
}
function today(): string { return new Date().toISOString().slice(0, 10); }

async function exportCSV(dim: string, token: string | null) {
  try {
    const r = await fetch(`https://deepx.fun/api/v2/admin/reports/${dim}/export?from=${sevenDaysAgo()}&to=${today()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${dim}-report.csv`; a.click();
    URL.revokeObjectURL(url);
  } catch (err) { alert(`Export failed: ${err}`); }
}
