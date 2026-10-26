import type { FormEvent, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ApiError } from '../api';

export function CreateModal({
  title, label, placeholder, descriptionLabel, busy, onClose, onCreate,
}: {
  title: string; label: string; placeholder: string; descriptionLabel?: string;
  busy?: boolean; onClose: () => void;
  onCreate: (title: string, description: string) => Promise<void>;
}) {
  const titleId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const locked = Boolean(busy || submitting);
  useEffect(() => {
    input.current?.focus();
    function escape(event: KeyboardEvent) { if (event.key === 'Escape' && !locked) onClose(); }
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose, locked]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = value.trim();
    if (!clean) return;
    setError(''); setSubmitting(true);
    try { await onCreate(clean, description.trim()); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Не удалось создать. Повторите попытку.'); }
    finally { setSubmitting(false); }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !locked) onClose(); }}>
    <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="modal-header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" onClick={onClose} disabled={locked} aria-label="Закрыть"><X size={20}/></button></div>
      <form onSubmit={submit} className="modal-form">
        <label className="field-label" htmlFor="create-title">{label}</label>
        <input ref={input} id="create-title" className="field-input" maxLength={200} required placeholder={placeholder} value={value} onChange={e=>setValue(e.target.value)}/>
        {descriptionLabel && <><label className="field-label" htmlFor="create-desc">{descriptionLabel}</label>
          <textarea id="create-desc" rows={3} className="field-input field-textarea" maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Необязательно"/></>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><button type="button" className="button button-subtle" onClick={onClose} disabled={locked}>Отмена</button>
        <button className="button button-primary" type="submit" disabled={locked || !value.trim()}>{locked ? 'Создаём…' : 'Создать'}</button></div>
      </form>
    </div>
  </div>;
}
export function EmptyState({ icon, title, subtitle, action }: {
  icon: ReactNode; title: string; subtitle: string; action?: ReactNode;
}) {
  return <div className="empty-state">
    <span className="empty-icon">{icon}</span>
    <h2>{title}</h2><p>{subtitle}</p>{action}
  </div>;
}
