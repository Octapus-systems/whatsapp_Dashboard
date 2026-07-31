import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, Clock, XCircle, Loader2, Users, CalendarClock } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import {
  useSessionsQuery,
  useSessionContactsQuery,
  useBroadcastsQuery,
  useCreateBroadcastMutation,
  useCancelBroadcastMutation,
} from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import type { BroadcastStatus, BroadcastSummary } from '../services/api';
import './Broadcast.css';

function statusClass(status: BroadcastStatus): string {
  switch (status) {
    case 'completed':
      return 'status-badge status-completed';
    case 'processing':
      return 'status-badge status-processing';
    case 'scheduled':
      return 'status-badge status-scheduled';
    case 'failed':
      return 'status-badge status-failed';
    case 'cancelled':
      return 'status-badge status-cancelled';
    default:
      return 'status-badge status-pending';
  }
}

function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function Broadcast() {
  const { t } = useTranslation();
  useDocumentTitle(t('broadcast.title'));
  const { canWrite } = useRole();

  const { data: allSessions = [], isLoading: loadingSessions } = useSessionsQuery();
  const sessions = allSessions.filter(s => s.status === 'ready');

  const [session, setSession] = useState('');
  const [recipientMode, setRecipientMode] = useState<'all' | 'select'>('all');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ success: boolean; text: string } | null>(null);

  const { data: contacts = [], isLoading: loadingContacts } = useSessionContactsQuery(
    session,
    recipientMode === 'select',
  );
  const { data: broadcasts = [], isLoading: loadingBroadcasts } = useBroadcastsQuery(session, !!session);

  const createBroadcast = useCreateBroadcastMutation();
  const cancelBroadcast = useCancelBroadcastMutation();

  useEffect(() => {
    if (sessions.length > 0 && !session) {
      setSession(sessions[0].id);
    }
  }, [sessions, session]);

  useEffect(() => {
    setSelectedContacts(new Set());
  }, [session]);

  const recipientCount = recipientMode === 'all' ? undefined : selectedContacts.size;

  const toggleContact = (id: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit = useMemo(() => {
    if (!canWrite || !session || !message.trim()) return false;
    if (recipientMode === 'select' && selectedContacts.size === 0) return false;
    if (isScheduled && !scheduledAt) return false;
    return true;
  }, [canWrite, session, message, recipientMode, selectedContacts, isScheduled, scheduledAt]);

  const handleSubmit = async () => {
    setFormError(null);
    setLastResult(null);

    if (isScheduled && scheduledAt) {
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate.getTime() <= Date.now()) {
        setFormError(t('broadcast.scheduleInPastError'));
        return;
      }
    }

    try {
      const result = await createBroadcast.mutateAsync({
        sessionId: session,
        payload: {
          message,
          allContacts: recipientMode === 'all',
          recipients: recipientMode === 'select' ? Array.from(selectedContacts) : undefined,
          scheduledAt: isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        },
      });
      setLastResult({
        success: true,
        text: t('broadcast.createSuccess', {
          id: result.broadcastId,
          count: result.totalRecipients,
        }),
      });
      setMessage('');
      setIsScheduled(false);
      setScheduledAt('');
      setSelectedContacts(new Set());
    } catch (err) {
      setLastResult({
        success: false,
        text: err instanceof Error ? err.message : t('broadcast.createFailed'),
      });
    }
  };

  const handleCancel = async (broadcastId: string) => {
    if (!session) return;
    await cancelBroadcast.mutateAsync({ sessionId: session, broadcastId });
  };

  const minDateTime = toLocalDateTimeInputValue(new Date(Date.now() + 60_000));

  if (loadingSessions) {
    return (
      <div className="broadcast-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="broadcast-page">
      <PageHeader title={t('broadcast.title')} subtitle={t('broadcast.subtitle')} />

      <div className="broadcast-panels">
        <div className="compose-panel">
          <h2>{t('broadcast.compose')}</h2>

          <div className="form-group">
            <label>{t('broadcast.session')}</label>
            <select value={session} onChange={e => setSession(e.target.value)}>
              {sessions.length === 0 && <option value="">{t('broadcast.noReadySessions')}</option>}
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.phone || t('broadcast.sessionOptionPhoneNone')})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>{t('broadcast.recipients')}</label>
            <div className="toggle-group">
              <button className={recipientMode === 'all' ? 'active' : ''} onClick={() => setRecipientMode('all')}>
                <Users size={14} /> {t('broadcast.allContacts')}
              </button>
              <button className={recipientMode === 'select' ? 'active' : ''} onClick={() => setRecipientMode('select')}>
                {t('broadcast.selectContacts')}
              </button>
            </div>

            {recipientMode === 'select' && (
              <div className="contact-picker">
                {loadingContacts && <p className="hint">{t('broadcast.loadingContacts')}</p>}
                {!loadingContacts && contacts.length === 0 && (
                  <p className="hint">{t('broadcast.noContactsFound')}</p>
                )}
                {!loadingContacts &&
                  contacts.map(c => (
                    <label key={c.id} className="contact-row">
                      <input
                        type="checkbox"
                        checked={selectedContacts.has(c.id)}
                        onChange={() => toggleContact(c.id)}
                      />
                      <span className="contact-name">{c.name || c.pushName || c.number}</span>
                      <span className="contact-number">{c.number}</span>
                    </label>
                  ))}
              </div>
            )}

            <span className="hint">
              {recipientMode === 'all'
                ? t('broadcast.allContactsHint')
                : t('broadcast.selectedCount', { count: recipientCount ?? 0 })}
            </span>
          </div>

          <div className="form-group">
            <label>{t('broadcast.messageContent')}</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t('broadcast.messagePlaceholder')}
              rows={6}
              maxLength={4096}
            />
            <span className="hint">{message.length} / 4096</span>
          </div>

          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" checked={isScheduled} onChange={e => setIsScheduled(e.target.checked)} />
              <CalendarClock size={14} /> {t('broadcast.scheduleForLater')}
            </label>
            {isScheduled && (
              <input
                type="datetime-local"
                value={scheduledAt}
                min={minDateTime}
                onChange={e => setScheduledAt(e.target.value)}
              />
            )}
          </div>

          {formError && <p className="form-error">{formError}</p>}

          <button className="send-btn" onClick={handleSubmit} disabled={!canSubmit || createBroadcast.isPending}>
            {createBroadcast.isPending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            {createBroadcast.isPending
              ? t('broadcast.sending')
              : !canWrite
                ? t('broadcast.viewOnly')
                : isScheduled
                  ? t('broadcast.schedule')
                  : t('broadcast.sendNow')}
          </button>

          {lastResult && (
            <div className={`result-banner ${lastResult.success ? 'success' : 'error'}`}>{lastResult.text}</div>
          )}
        </div>

        <div className="history-panel">
          <h2>{t('broadcast.history')}</h2>

          {loadingBroadcasts && (
            <div className="broadcast-empty">
              <Loader2 className="animate-spin" size={24} />
            </div>
          )}

          {!loadingBroadcasts && broadcasts.length === 0 && (
            <div className="broadcast-empty">
              <p>{t('broadcast.noBroadcasts')}</p>
            </div>
          )}

          {!loadingBroadcasts && broadcasts.length > 0 && (
            <ul className="broadcast-list">
              {broadcasts.map((b: BroadcastSummary) => (
                <li key={b.broadcastId} className="broadcast-item">
                  <div className="broadcast-item-top">
                    <span className={statusClass(b.status)}>{t(`broadcast.status.${b.status}`)}</span>
                    <span className="broadcast-recipients">
                      <Users size={13} /> {b.totalRecipients}
                    </span>
                  </div>
                  <p className="broadcast-message">{b.message}</p>
                  <div className="broadcast-progress">
                    <span>
                      {t('broadcast.progressSent', { sent: b.progress?.sent ?? 0, total: b.progress?.total ?? b.totalRecipients })}
                    </span>
                    {b.progress?.failed ? (
                      <span className="progress-failed">{t('broadcast.progressFailed', { failed: b.progress.failed })}</span>
                    ) : null}
                  </div>
                  <div className="broadcast-item-bottom">
                    {b.scheduledAt && (
                      <span className="broadcast-time">
                        <Clock size={12} /> {new Date(b.scheduledAt).toLocaleString()}
                      </span>
                    )}
                    {(b.status === 'pending' || b.status === 'scheduled' || b.status === 'processing') && canWrite && (
                      <button className="cancel-btn" onClick={() => handleCancel(b.broadcastId)}>
                        <XCircle size={14} /> {t('broadcast.cancel')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
