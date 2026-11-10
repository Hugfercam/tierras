import { useEffect, useState, type FormEvent } from 'react';
import type { GroupSummary } from '../../../shared/types.ts';
import { ApiError, createGroup } from '../../lib/api';
import { useOnlineStatus } from '../../hooks/useUi';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icons';
import { Modal } from '../ui/Modal';

interface CreateGroupDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (group: GroupSummary) => void;
}

export function CreateGroupDialog({ open, onClose, onCreated }: CreateGroupDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const online = useOnlineStatus();

  useEffect(() => {
    if (!open) {
      setName('');
      setError(null);
      setFieldError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setFieldError('Pon un nombre de al menos 2 caracteres.');
      return;
    }
    setLoading(true);
    setError(null);
    setFieldError(null);
    try {
      const result = await createGroup(cleanName);
      onCreated(result.group);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldError(caught.fieldErrors?.name ?? null);
        setError(caught.message);
      } else {
        setError('No pudimos crear el grupo. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Crear un grupo"
      eyebrow="Un nuevo mapa compartido"
      description="Reúne a tu gente para empezar a marcar los países que ya conocen."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="create-group-form"
            loading={loading}
            disabled={!online}
          >
            Crear grupo
          </Button>
        </>
      }
    >
      <form id="create-group-form" onSubmit={handleSubmit} className="form-stack">
        <label className="field">
          <span className="field__label">Nombre del grupo</span>
          <span className="input-wrap">
            <Icon name="users" size={18} className="input-wrap__icon" />
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Los Trotamundos"
              maxLength={60}
              autoFocus
              data-autofocus
            />
          </span>
          {fieldError ? <span className="field__error">{fieldError}</span> : null}
        </label>
        {error && !fieldError ? <p className="form-error">{error}</p> : null}
        {!online ? (
          <p className="form-note form-note--warn">
            Sin conexión. Para crear un grupo necesitas estar online.
          </p>
        ) : (
          <p className="form-note">
            Recibirás un código para invitar a quien quieras. El grupo es privado: solo entra
            quien tenga el código.
          </p>
        )}
      </form>
    </Modal>
  );
}
