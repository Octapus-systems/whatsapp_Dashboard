import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Edit,
  Trash2,
  Play,
  ExternalLink,
  Loader2,
  X,
  Webhook as WebhookIcon,
  Check,
  AlertTriangle,
  History,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { webhookApi, type Webhook, type WebhookDelivery } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import {
  useWebhooksQuery,
  useSessionsQuery,
  useCreateWebhookMutation,
  useUpdateWebhookMutation,
  useDeleteWebhookMutation,
} from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import './Webhooks.css';

const availableEventNames = [
  'message.received',
  'message.sent',
  'session.connected',
  'session.disconnected',
  'session.qr',
  '*',
] as const;

const TEST_TIMEOUT_MS = 15_000;

/** Pretty-print a delivery's response payload, whether it's JSON text, a plain string, or already an object. */
function formatResponsePayload(payload: unknown): string {
  if (payload == null) return '';
  if (typeof payload === 'string') {
    try {
      return JSON.stringify(JSON.parse(payload), null, 2);
    } catch {
      return payload;
    }
  }
  return JSON.stringify(payload, null, 2);
}

export function Webhooks() {
  const { t } = useTranslation();
  useDocumentTitle(t('webhooks.title'));
  const { canWrite } = useRole();
  const { data: webhooks = [], isLoading: loadingWebhooks } = useWebhooksQuery();
  const { data: sessions = [] } = useSessionsQuery();
  const loading = loadingWebhooks;
  const createMutation = useCreateWebhookMutation();
  const updateMutation = useUpdateWebhookMutation();
  const deleteMutation = useDeleteWebhookMutation();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    sessionId: string;
    id: string;
    url: string;
    events: string[];
  } | null>(null);
  const [editWebhook, setEditWebhook] = useState<Webhook | null>(null);
  const [newWebhook, setNewWebhook] = useState({ url: '', events: ['message.received'], sessionId: '' });
  const [testingId, setTestingId] = useState<string | null>(null);
  const testTokenRef = useRef(0);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Delivery history drawer ────────────────────────────────────────
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<{ sessionId: string; id: string; url: string } | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);
  const [deliveriesError, setDeliveriesError] = useState<string | null>(null);
  const [expandedDeliveryRowId, setExpandedDeliveryRowId] = useState<string | null>(null);
  const [deliveryDetail, setDeliveryDetail] = useState<WebhookDelivery | null>(null);
  const [loadingDeliveryDetail, setLoadingDeliveryDetail] = useState(false);

  const eventDescription = (name: string) => {
    if (name === '*') return t('webhooks.eventDescriptions.all');
    return t(`webhooks.eventDescriptions.${name}`, { defaultValue: name });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleCreate = async () => {
    if (!newWebhook.url || !newWebhook.sessionId) return;
    try {
      await createMutation.mutateAsync({
        sessionId: newWebhook.sessionId,
        url: newWebhook.url,
        events: newWebhook.events,
      });
      setShowCreateModal(false);
      setNewWebhook({ url: '', events: ['message.received'], sessionId: '' });
      setToast({ type: 'success', message: t('webhooks.toasts.created') });
    } catch (err) {
      setToast({
        type: 'error',
        message: t('webhooks.toasts.createFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    }
  };

  const confirmDelete = (sessionId: string, id: string, url: string, events: string[]) => {
    setDeleteTarget({ sessionId, id, url, events });
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync({ sessionId: deleteTarget.sessionId, id: deleteTarget.id });
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setToast({ type: 'success', message: t('webhooks.toasts.deleted') });
    } catch (err) {
      setToast({
        type: 'error',
        message: t('webhooks.toasts.deleteFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    }
  };

  const handleTest = async (sessionId: string, id: string) => {
    // Clicking the Test button again while a test is already in flight for this
    // webhook cancels/dismisses the stuck state instead of queuing another request.
    if (testingId === id) {
      testTokenRef.current += 1;
      setTestingId(null);
      setToast({ type: 'error', message: t('webhooks.toasts.testCancelled') });
      return;
    }

    const token = ++testTokenRef.current;
    setTestingId(id);
    try {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(t('webhooks.toasts.testTimeout'))), TEST_TIMEOUT_MS);
      });
      const result = await Promise.race([webhookApi.test(sessionId, id), timeout]);
      if (testTokenRef.current !== token) return; // superseded or cancelled by the user
      if (result.success) {
        setToast({ type: 'success', message: t('webhooks.toasts.testOk', { status: result.statusCode }) });
      } else {
        setToast({
          type: 'error',
          message: t('webhooks.toasts.testFailed', { message: result.error || `Status ${result.statusCode}` }),
        });
      }
    } catch (err) {
      if (testTokenRef.current !== token) return; // superseded or cancelled by the user
      setToast({
        type: 'error',
        message: t('webhooks.toasts.testError', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    } finally {
      if (testTokenRef.current === token) setTestingId(null);
    }
  };

  const loadDeliveries = useCallback(async (sessionId: string, id: string) => {
    setLoadingDeliveries(true);
    setDeliveriesError(null);
    try {
      const result = await webhookApi.getDeliveries(sessionId, id);
      setDeliveries(result.items);
    } catch (err) {
      setDeliveriesError(err instanceof Error ? err.message : t('common.unknownError'));
    } finally {
      setLoadingDeliveries(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openHistory = (webhook: Webhook) => {
    setHistoryTarget({ sessionId: webhook.sessionId, id: webhook.id, url: webhook.url });
    setExpandedDeliveryRowId(null);
    setDeliveryDetail(null);
    setShowHistoryModal(true);
    void loadDeliveries(webhook.sessionId, webhook.id);
  };

  const closeHistory = () => {
    setShowHistoryModal(false);
    setHistoryTarget(null);
    setDeliveries([]);
    setExpandedDeliveryRowId(null);
    setDeliveryDetail(null);
  };

  const toggleDeliveryRow = async (delivery: WebhookDelivery) => {
    if (!historyTarget) return;
    if (expandedDeliveryRowId === delivery.id) {
      setExpandedDeliveryRowId(null);
      setDeliveryDetail(null);
      return;
    }
    setExpandedDeliveryRowId(delivery.id);
    setDeliveryDetail(null);
    setLoadingDeliveryDetail(true);
    try {
      const full = await webhookApi.getDelivery(historyTarget.sessionId, historyTarget.id, delivery.id);
      setDeliveryDetail(full);
    } catch (err) {
      setToast({
        type: 'error',
        message: t('webhooks.history.loadDetailFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
      setExpandedDeliveryRowId(null);
    } finally {
      setLoadingDeliveryDetail(false);
    }
  };

  const openEdit = (webhook: Webhook) => {
    setEditWebhook({ ...webhook });
    setShowEditModal(true);
  };

  const handleEdit = async () => {
    if (!editWebhook) return;
    try {
      await updateMutation.mutateAsync({
        sessionId: editWebhook.sessionId,
        id: editWebhook.id,
        data: { url: editWebhook.url, events: editWebhook.events, active: editWebhook.active },
      });
      setShowEditModal(false);
      setEditWebhook(null);
      setToast({ type: 'success', message: t('webhooks.toasts.updated') });
    } catch (err) {
      setToast({
        type: 'error',
        message: t('webhooks.toasts.updateFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    }
  };

  const toggleEditEvent = (event: string) => {
    if (!editWebhook) return;
    setEditWebhook({
      ...editWebhook,
      events: editWebhook.events.includes(event)
        ? editWebhook.events.filter(e => e !== event)
        : [...editWebhook.events, event],
    });
  };

  const toggleNewEvent = (event: string) => {
    setNewWebhook(prev => ({
      ...prev,
      events: prev.events.includes(event) ? prev.events.filter(e => e !== event) : [...prev.events, event],
    }));
  };

  if (loading) {
    return (
      <div
        className="webhooks-page"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}
      >
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="webhooks-page">
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
          <span>{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      <PageHeader
        title={t('webhooks.title')}
        subtitle={t('webhooks.subtitle')}
        actions={
          canWrite && (
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={18} />
              {t('webhooks.addWebhook')}
            </button>
          )
        }
      />

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('webhooks.createTitle')}</h2>
              <button className="btn-icon" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <label>{t('webhooks.session')}</label>
              <select
                value={newWebhook.sessionId}
                onChange={e => setNewWebhook({ ...newWebhook, sessionId: e.target.value })}
              >
                <option value="">{t('webhooks.selectSession')}</option>
                {sessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <label>{t('common.url')}</label>
              <input
                type="url"
                placeholder="https://..."
                value={newWebhook.url}
                onChange={e => setNewWebhook({ ...newWebhook, url: e.target.value })}
              />
              <label>{t('webhooks.events')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {availableEventNames.map(name => (
                  <button
                    key={name}
                    type="button"
                    className={`event-tag ${newWebhook.events.includes(name) ? 'selected' : ''}`}
                    onClick={() => toggleNewEvent(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary" onClick={handleCreate}>
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editWebhook && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('webhooks.editTitle')}</h2>
              <button className="btn-icon" onClick={() => setShowEditModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <label>{t('common.url')}</label>
              <input
                type="url"
                value={editWebhook.url}
                onChange={e => setEditWebhook({ ...editWebhook, url: e.target.value })}
              />
              <label>{t('webhooks.events')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {availableEventNames.map(name => (
                  <button
                    key={name}
                    type="button"
                    className={`event-tag ${editWebhook.events.includes(name) ? 'selected' : ''}`}
                    onClick={() => toggleEditEvent(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="toggle-group">
                <span className="toggle-label">{t('common.status')}</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={editWebhook.active}
                    onChange={e => setEditWebhook({ ...editWebhook, active: e.target.checked })}
                  />
                  <span className="toggle-slider"></span>
                </label>
                <span className={`toggle-status ${editWebhook.active ? 'active' : 'inactive'}`}>
                  {editWebhook.active ? t('common.active') : t('common.inactive')}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowEditModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary" onClick={handleEdit}>
                {t('webhooks.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && deleteTarget && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('webhooks.deleteTitle')}</h2>
              <button className="btn-icon" onClick={() => setShowDeleteModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p>{t('webhooks.deleteConfirm')}</p>
              <code
                style={{
                  display: 'block',
                  marginTop: '0.5rem',
                  padding: '0.5rem',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  wordBreak: 'break-all',
                }}
              >
                {deleteTarget.url}
              </code>
              <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                <div>
                  <strong>{t('webhooks.session')}:</strong>{' '}
                  {sessions.find(s => s.id === deleteTarget.sessionId)?.name ||
                    deleteTarget.sessionId.substring(0, 8)}
                </div>
                <div style={{ marginTop: '0.35rem' }}>
                  <strong>{t('webhooks.events')}:</strong> {deleteTarget.events.join(', ')}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn-danger" onClick={handleDelete}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistoryModal && historyTarget && (
        <div className="modal-overlay" onClick={closeHistory}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('webhooks.history.title')}</h2>
              <button className="btn-icon" onClick={closeHistory}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <code className="history-webhook-url">{historyTarget.url}</code>

              {loadingDeliveries ? (
                <div className="history-loading">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : deliveriesError ? (
                <div className="history-error">
                  <AlertTriangle size={18} />
                  <span>{deliveriesError}</span>
                </div>
              ) : deliveries.length === 0 ? (
                <div className="history-empty">
                  <p>{t('webhooks.history.empty')}</p>
                </div>
              ) : (
                <div className="delivery-list">
                  <div className="delivery-row delivery-row-header">
                    <span></span>
                    <span>{t('webhooks.history.columns.status')}</span>
                    <span>{t('webhooks.history.columns.event')}</span>
                    <span>{t('webhooks.history.columns.responseCode')}</span>
                    <span>{t('webhooks.history.columns.duration')}</span>
                    <span>{t('webhooks.history.columns.timestamp')}</span>
                  </div>
                  {deliveries.map(delivery => (
                    <div key={delivery.id} className="delivery-row-group">
                      <button
                        type="button"
                        className="delivery-row"
                        onClick={() => void toggleDeliveryRow(delivery)}
                      >
                        <span className="delivery-expand-icon">
                          {expandedDeliveryRowId === delivery.id ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronRight size={14} />
                          )}
                        </span>
                        <span>
                          <span className={`status-badge ${delivery.success ? 'active' : 'inactive'}`}>
                            {delivery.success ? t('webhooks.history.success') : t('webhooks.history.failed')}
                          </span>
                        </span>
                        <span className="delivery-event">{delivery.event}</span>
                        <span>{delivery.statusCode ?? t('webhooks.history.noResponse')}</span>
                        <span>{delivery.durationMs != null ? `${delivery.durationMs}ms` : '—'}</span>
                        <span className="delivery-timestamp">{new Date(delivery.createdAt).toLocaleString()}</span>
                      </button>

                      {expandedDeliveryRowId === delivery.id && (
                        <div className="delivery-detail">
                          {loadingDeliveryDetail ? (
                            <div className="history-loading">
                              <Loader2 size={20} className="animate-spin" />
                            </div>
                          ) : deliveryDetail ? (
                            <>
                              {deliveryDetail.error && (
                                <div className="delivery-detail-error">{deliveryDetail.error}</div>
                              )}
                              <div className="delivery-detail-section">
                                <h4>{t('webhooks.history.request')}</h4>
                                <pre>{JSON.stringify(deliveryDetail.requestPayload, null, 2)}</pre>
                              </div>
                              <div className="delivery-detail-section">
                                <h4>{t('webhooks.history.requestHeaders')}</h4>
                                <pre>{JSON.stringify(deliveryDetail.requestHeaders, null, 2)}</pre>
                              </div>
                              <div className="delivery-detail-section">
                                <h4>{t('webhooks.history.response')}</h4>
                                <pre>{formatResponsePayload(deliveryDetail.responsePayload)}</pre>
                              </div>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeHistory}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="webhooks-content">
        <div className="webhooks-table-container">
          <div className="webhooks-table">
            <div className="table-row header">
              <span>{t('webhooks.columns.url')}</span>
              <span>{t('webhooks.columns.events')}</span>
              <span>{t('webhooks.columns.session')}</span>
              <span>{t('webhooks.columns.status')}</span>
              <span>{t('webhooks.columns.actions')}</span>
            </div>
            {webhooks.length === 0 ? (
              <div className="empty-table-state">
                <WebhookIcon size={48} strokeWidth={1} />
                <h3>{t('webhooks.empty.title')}</h3>
                <p>{t('webhooks.empty.description')}</p>
              </div>
            ) : (
              webhooks.map(webhook => (
                <div key={webhook.id} className="table-row">
                  <span className="url-cell">
                    <code>{webhook.url}</code>
                    <ExternalLink size={14} />
                  </span>
                  <span className="events-cell">
                    {webhook.events.map((event: string) => (
                      <span key={event} className="event-tag">
                        {event}
                      </span>
                    ))}
                  </span>
                  <span>
                    {sessions.find(s => s.id === webhook.sessionId)?.name || webhook.sessionId.substring(0, 8)}
                  </span>
                  <span>
                    <span className={`status-badge ${webhook.active ? 'active' : 'inactive'}`}>
                      {webhook.active ? t('common.active') : t('common.inactive')}
                    </span>
                  </span>
                  <span className="actions-cell">
                    <button
                      className="icon-btn"
                      title={t('webhooks.actions.test')}
                      onClick={() => handleTest(webhook.sessionId, webhook.id)}
                      disabled={testingId === webhook.id}
                    >
                      {testingId === webhook.id ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    </button>
                    <button
                      className="icon-btn"
                      title={t('webhooks.history.title')}
                      onClick={() => openHistory(webhook)}
                    >
                      <History size={16} />
                    </button>
                    {canWrite && (
                      <>
                        <button className="icon-btn" title={t('webhooks.actions.edit')} onClick={() => openEdit(webhook)}>
                          <Edit size={16} />
                        </button>
                        <button
                          className="icon-btn danger"
                          title={t('webhooks.actions.delete')}
                          onClick={() => confirmDelete(webhook.sessionId, webhook.id, webhook.url, webhook.events)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="events-reference">
          <h3>{t('webhooks.available')}</h3>
          <div className="events-list">
            {availableEventNames.map(name => (
              <div key={name} className="event-item">
                <code>{name}</code>
                <span>{eventDescription(name)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
