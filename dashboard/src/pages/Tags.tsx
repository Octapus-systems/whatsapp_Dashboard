import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Edit, Trash2, X, Tag as TagIcon, Check, AlertTriangle, Loader2 } from 'lucide-react';
import { tagApi, type Tag } from '../services/api';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import { PageHeader } from '../components/PageHeader';
import './Tags.css';

const DEFAULT_COLOR = '#6366f1';

const SWATCHES = [
  '#6366f1',
  '#22c55e',
  '#ef4444',
  '#f59e0b',
  '#0ea5e9',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#64748b',
];

export function Tags() {
  const { t } = useTranslation();
  useDocumentTitle(t('tags.title'));
  const { canWrite } = useRole();

  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [newTag, setNewTag] = useState({ name: '', color: DEFAULT_COLOR });
  const [saving, setSaving] = useState(false);

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tagApi.list();
      setTags(data);
    } catch (err) {
      setToast({
        type: 'error',
        message: err instanceof Error ? err.message : t('common.unknownError'),
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleCreate = async () => {
    if (!newTag.name.trim()) return;
    setSaving(true);
    try {
      await tagApi.create({ name: newTag.name.trim(), color: newTag.color });
      setShowCreateModal(false);
      setNewTag({ name: '', color: DEFAULT_COLOR });
      setToast({ type: 'success', message: t('tags.toasts.created') });
      await loadTags();
    } catch (err) {
      setToast({
        type: 'error',
        message: t('tags.toasts.createFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (tag: Tag) => {
    setEditTag({ ...tag });
    setShowEditModal(true);
  };

  const handleEdit = async () => {
    if (!editTag) return;
    setSaving(true);
    try {
      await tagApi.update(editTag.id, { name: editTag.name, color: editTag.color });
      setShowEditModal(false);
      setEditTag(null);
      setToast({ type: 'success', message: t('tags.toasts.updated') });
      await loadTags();
    } catch (err) {
      setToast({
        type: 'error',
        message: t('tags.toasts.updateFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (tag: Tag) => {
    setDeleteTarget(tag);
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await tagApi.delete(deleteTarget.id);
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setToast({ type: 'success', message: t('tags.toasts.deleted') });
      await loadTags();
    } catch (err) {
      setToast({
        type: 'error',
        message: t('tags.toasts.deleteFailed', {
          message: err instanceof Error ? err.message : t('common.unknownError'),
        }),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="tags-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="tags-page">
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
        title={t('tags.title')}
        subtitle={t('tags.subtitle')}
        actions={
          canWrite && (
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
              <Plus size={18} />
              {t('tags.addTag')}
            </button>
          )
        }
      />

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('tags.createTitle')}</h2>
              <button className="btn-icon" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <label>{t('common.name')}</label>
              <input
                type="text"
                placeholder={t('tags.namePlaceholder')}
                value={newTag.name}
                onChange={e => setNewTag({ ...newTag, name: e.target.value })}
                maxLength={100}
                autoFocus
              />
              <label>{t('tags.color')}</label>
              <div className="color-swatches">
                {SWATCHES.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${newTag.color === color ? 'selected' : ''}`}
                    style={{ background: color }}
                    onClick={() => setNewTag({ ...newTag, color })}
                    aria-label={color}
                  />
                ))}
                <input
                  type="color"
                  className="color-picker"
                  value={newTag.color}
                  onChange={e => setNewTag({ ...newTag, color: e.target.value })}
                />
              </div>
              <div className="tag-preview">
                <span className="tag-chip" style={{ background: `${newTag.color}1a`, color: newTag.color }}>
                  <span className="tag-dot" style={{ background: newTag.color }} />
                  {newTag.name || t('tags.namePlaceholder')}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary" onClick={handleCreate} disabled={!newTag.name.trim() || saving}>
                {t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editTag && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('tags.editTitle')}</h2>
              <button className="btn-icon" onClick={() => setShowEditModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <label>{t('common.name')}</label>
              <input
                type="text"
                value={editTag.name}
                onChange={e => setEditTag({ ...editTag, name: e.target.value })}
                maxLength={100}
              />
              <label>{t('tags.color')}</label>
              <div className="color-swatches">
                {SWATCHES.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${editTag.color === color ? 'selected' : ''}`}
                    style={{ background: color }}
                    onClick={() => setEditTag({ ...editTag, color })}
                    aria-label={color}
                  />
                ))}
                <input
                  type="color"
                  className="color-picker"
                  value={editTag.color}
                  onChange={e => setEditTag({ ...editTag, color: e.target.value })}
                />
              </div>
              <div className="tag-preview">
                <span className="tag-chip" style={{ background: `${editTag.color}1a`, color: editTag.color }}>
                  <span className="tag-dot" style={{ background: editTag.color }} />
                  {editTag.name}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowEditModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary" onClick={handleEdit} disabled={!editTag.name.trim() || saving}>
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
              <h2>{t('tags.deleteTitle')}</h2>
              <button className="btn-icon" onClick={() => setShowDeleteModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <p>{t('tags.deleteConfirm')}</p>
              <span
                className="tag-chip"
                style={{ background: `${deleteTarget.color}1a`, color: deleteTarget.color, marginTop: '0.5rem' }}
              >
                <span className="tag-dot" style={{ background: deleteTarget.color }} />
                {deleteTarget.name}
              </span>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn-danger" onClick={handleDelete} disabled={saving}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tags-content">
        <div className="tags-table-container">
          <div className="tags-table">
            <div className="table-row header">
              <span>{t('tags.columns.name')}</span>
              <span>{t('tags.columns.color')}</span>
              <span>{t('tags.columns.created')}</span>
              <span>{t('common.actions')}</span>
            </div>
            {tags.length === 0 ? (
              <div className="empty-table-state">
                <TagIcon size={48} strokeWidth={1} />
                <h3>{t('tags.empty.title')}</h3>
                <p>{t('tags.empty.description')}</p>
              </div>
            ) : (
              tags.map(tag => (
                <div key={tag.id} className="table-row">
                  <span>
                    <span className="tag-chip" style={{ background: `${tag.color}1a`, color: tag.color }}>
                      <span className="tag-dot" style={{ background: tag.color }} />
                      {tag.name}
                    </span>
                  </span>
                  <span>
                    <code className="color-code">{tag.color}</code>
                  </span>
                  <span>{new Date(tag.createdAt).toLocaleDateString()}</span>
                  <span className="actions-cell">
                    {canWrite && (
                      <>
                        <button className="icon-btn" title={t('common.edit')} onClick={() => openEdit(tag)}>
                          <Edit size={16} />
                        </button>
                        <button
                          className="icon-btn danger"
                          title={t('common.delete')}
                          onClick={() => confirmDelete(tag)}
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
