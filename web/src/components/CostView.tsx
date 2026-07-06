import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import s from './ReportsView.module.css';

async function fetchJSON(url: string, token: string | null): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function CostView() {
  const { t } = useTranslation();
  const token = useStore((st) => st.token);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchJSON('/api/v2/admin/cost', token).then(setData).catch(() => setData(null));
  }, [token]);

  return (
    <div className={s.root}>
      <h1 className={s.title}>{t('cost.title')}</h1>
      <div className={s.total}>
        {t('cost.total30d')}: <strong>${(data?.totalLast30d || 0).toFixed(4)}</strong>
      </div>
      <table className={s.table}>
        <thead>
          <tr><th>{t('cost.colDate')}</th><th>{t('cost.colDimension')}</th><th>{t('cost.colCost')}</th></tr>
        </thead>
        <tbody>
          {data?.breakdown?.slice(0, 30).map((r: any, i: number) => (
            <tr key={i}>
              <td>{r.date?.toString().slice(0, 10) || '—'}</td>
              <td>{r.dimension}</td>
              <td className={s.mono}>${Number(r.cost).toFixed(4)}</td>
            </tr>
          ))}
          {(!data?.breakdown || data.breakdown.length === 0) && (
            <tr><td colSpan={3} className={s.empty}>{t('cost.noData')}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
