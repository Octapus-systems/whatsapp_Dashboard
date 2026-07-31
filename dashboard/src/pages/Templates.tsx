import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Edit, Trash2, Loader2, X, MessageSquareText, Check, AlertTriangle } from 'lucide-react';
import type { MessageTemplate } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import {
  useTemplatesQuery,
  useCreateTemplateMutation,
  useUpdateTemplateMutation,
  useDeleteTemplateMutation,
} from '../hooks/queries';
import { PageHeader } from '../components/PageHeader';
import './Templates.css';

export function Templates() {
  const { t } = useTranslation();
  useDocumentTitle(t('templates.title'));
  const { canWrite } = useRole();
  const { data: templates = [], isLoading: loading } = useTemplatesQuery();
  const createMutation = useCreateTemplateMutation();
  const updateMutation = useUpdateTemplateMutation();
  const deleteMutation = useDeleteTemplateMutation();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MessageTemplate | null>(null);
  const [editTemplate, setEditTemplate] = useState<MessageTemplate | null>(null);
  const [newTemplate, setNewTemplate] = useState({ name: '', content: '' });
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleCreate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.content.trim()) return;
    try {
      await createMutation.mutateAsync({ name: newTemplate.name.trim(), content: newTemplate.content });
      setShowCreateModal(false);
      setNewTemplate({ name: '', content: '' });
      setToast({ type: 'success', message: t('templates.toasts.created') });
    } catch (err) {
      setToast({
        type: 'error',
        message: t('templates.toasts.createFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    }
  };

  const openEdit = (template: MessageTemplate) => {
    setEditTemplate({ ...template });
    setShowEditModal(true);
  };

  const handleEdit = async () => {
    if (!editTemplate || !editTemplate.name.trim() || !editTemplate.content.trim()) return;
    try {
      await updateMutation.mutateAsync({
        id: editTemplate.id,
        data: { name: editTemplate.name.trim(), content: editTemplate.content },
      });
      setShowEditModal(false);
      setEditTemplate(null);
      setToast({ type: 'success', message: t('templates.toasts.updated') });
    } catch (err) {
      setToast({
        type: 'error',
        message: t('templates.toasts.updateFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    }
  };

  const confirmDelete = (template: MessageTemplate) => {
    setDeleteTarget(template);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setToast({ type: 'success', message: t('templates.toasts.deleted') });
    } catch (err) {
      setToast({
        type: 'error',
        message: t('templates.toasts.deleteFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    }
  };

  if (loading) {
    return (
      <div
        className="templates-page"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}
      >
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="templates-page">
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
        title={t('templates.title')}
        subtitle={t('templates.subtitle')}
        actions={
          canWrite && (
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={18} />
              {t('templates.addTemplate')}
            </button>
          )
        }
      />

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('templates.createTitle')}</h2>
              <button className="btn-icon" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <label>{t('templates.name')}</label>
              <input
                type="text"
                placeholder={t('templates.namePlaceholder')}
                value={newTemplate.name}
                onChange={e => setNewTemplate({ ...newTemplate, name: e.target.value })}
              />
              <label>{t('templates.content')}</label>
              <textarea
                rows={5}
                placeholder={t('templates.contentPlaceholder')}
                value={newTemplate.content}
                onChange={e => setNewTemplate({ ...newTemplate, content: e.target.value })}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={handleCreate}
                disabled={!newTemplate.name.trim() || !newTemplate.content.trim() || createMutation.isPending}
              >
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editTemplate && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('templates.editTitle')}</h2>
              <button className="btn-icon" onClick={() => setShowEditModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <label>{t('templates.name')}</label>
              <input
                type="text"
                value={editTemplate.name}
                onChange={e => setEditTemplate({ ...editTemplate, name: e.target.value })}
              />
              <label>{t('templates.content')}</label>
              <textarea
                rows={5}
                value={editTemplate.content}
                onChange={e => setEditTemplate({ ...editTemplate, content: e.target.value })}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowEditModal(false)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                onClick={handleEdit}
                disabled={!editTemplate.name.trim() || !editTemplate.content.trim() || updateMutation.isPending}
              >
                {t('templates.saveChanges')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && deleteTarget && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('templates.deleteTitle')}</h2>
              <button className="btn-icon" onClick={() => setShowDeleteModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p>{t('templates.deleteConfirm')}</p>
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
                {deleteTarget.name}
              </code>
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

      <div className="templates-content">
        <div className="templates-table-container">
          <div className="templates-table">
            <div className="table-row header">
              <span>{t('templates.columns.name')}</span>
              <span>{t('templates.columns.content')}</span>
              <span>{t('templates.columns.actions')}</span>
            </div>
            {templates.length === 0 ? (
              <div className="empty-table-state">
                <MessageSquareText size={48} strokeWidth={1} />
                <h3>{t('templates.empty.title')}</h3>
                <p>{t('templates.empty.description')}</p>
              </div>
            ) : (
              templates.map(template => (
                <div key={template.id} className="table-row">
                  <span className="name-cell">{template.name}</span>
                  <span className="content-cell">{template.content}</span>
                  <span className="actions-cell">
                    {canWrite && (
                      <>
                        <button className="icon-btn" title={t('templates.actions.edit')} onClick={() => openEdit(template)}>
                          <Edit size={16} />
                        </button>
                        <button
                          className="icon-btn danger"
                          title={t('templates.actions.delete')}
                          onClick={() => confirmDelete(template)}
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
      </div>
    </div>
  );
}
