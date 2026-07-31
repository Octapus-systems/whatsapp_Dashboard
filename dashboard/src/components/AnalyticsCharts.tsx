import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { useMessageStatsQuery, useSessionsUptimeQuery } from '../hooks/queries';
import './AnalyticsCharts.css';

const PERIODS: Array<'14d' | '30d'> = ['14d', '30d'];

const STATUS_COLORS: Record<string, string> = {
  ready: '#25d366',
  connecting: '#d97706',
  initializing: '#d97706',
  authenticating: '#d97706',
  qr_ready: '#3b82f6',
  created: '#94a3b8',
  disconnected: '#94a3b8',
  failed: '#ef4444',
};

function formatDateLabel(value: string): string {
  // timestamp comes back as 'YYYY-MM-DD' for day granularity
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatUptime(ms: number | null, t: (key: string) => string): string {
  if (ms === null || ms < 0) return t('common.never');
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function AnalyticsCharts() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'14d' | '30d'>('14d');
  const { data: messageStats, isLoading: loadingMessages } = useMessageStatsQuery(period);
  const { data: uptimeSummary, isLoading: loadingUptime } = useSessionsUptimeQuery();

  const chartData = useMemo(
    () =>
      (messageStats?.timeSeries ?? []).map(point => ({
        ...point,
        label: formatDateLabel(point.timestamp),
      })),
    [messageStats],
  );

  const statusData = useMemo(() => {
    const dist = uptimeSummary?.statusDistribution ?? {};
    return Object.entries(dist).map(([status, count]) => ({
      status,
      count,
      label: t(`sessionStatus.${status}`, { defaultValue: status }),
    }));
  }, [uptimeSummary, t]);

  return (
    <div className="analytics-grid">
      <section className="analytics-card">
        <div className="section-header">
          <h2>{t('dashboard.analytics.messageVolume')}</h2>
          <div className="period-toggle">
            {PERIODS.map(p => (
              <button
                key={p}
                type="button"
                className={`period-btn ${period === p ? 'active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {t(`dashboard.analytics.period.${p}`)}
              </button>
            ))}
          </div>
        </div>

        {loadingMessages ? (
          <div className="chart-empty">{t('common.loading', { defaultValue: 'Loading...' })}</div>
        ) : chartData.length === 0 ? (
          <div className="chart-empty">{t('dashboard.analytics.noMessageData')}</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sentGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#25d366" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#25d366" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="receivedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e2e8f0)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--text-secondary, #64748b)', fontSize: 12 }}
                axisLine={{ stroke: 'var(--border, #e2e8f0)' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: 'var(--text-secondary, #64748b)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-white, #fff)',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend
                formatter={value =>
                  value === 'sent' ? t('dashboard.analytics.sent') : t('dashboard.analytics.received')
                }
                wrapperStyle={{ fontSize: 12 }}
              />
              <Area
                type="monotone"
                dataKey="sent"
                name="sent"
                stroke="#25d366"
                fill="url(#sentGradient)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="received"
                name="received"
                stroke="#3b82f6"
                fill="url(#receivedGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="analytics-card">
        <div className="section-header">
          <h2>{t('dashboard.analytics.sessionStatus')}</h2>
          <span className="section-subtitle">{t('dashboard.analytics.sessionStatusSubtitle')}</span>
        </div>

        {loadingUptime ? (
          <div className="chart-empty">{t('common.loading', { defaultValue: 'Loading...' })}</div>
        ) : statusData.length === 0 ? (
          <div className="chart-empty">{t('dashboard.analytics.noSessionData')}</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={statusData} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e2e8f0)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fill: 'var(--text-secondary, #64748b)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={100}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-white, #fff)',
                  border: '1px solid var(--border, #e2e8f0)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {statusData.map(entry => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        <div className="uptime-list">
          {(uptimeSummary?.sessions ?? []).slice(0, 6).map(session => (
            <div key={session.id} className="uptime-row">
              <span className={`status-pill ${session.status}`}>
                {t(`sessionStatus.${session.status}`, { defaultValue: session.status })}
              </span>
              <span className="uptime-name" title={session.name}>
                {session.name}
              </span>
              <span className="uptime-value">{formatUptime(session.uptimeMs, t)}</span>
            </div>
          ))}
          {uptimeSummary && uptimeSummary.sessions.length === 0 && (
            <div className="chart-empty">{t('dashboard.analytics.noSessionData')}</div>
          )}
        </div>
      </section>
    </div>
  );
}
