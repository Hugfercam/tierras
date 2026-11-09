import { useEffect, useState, type FormEvent } from 'react';
import type { GroupSummary } from '../../../shared/types.ts';
import { ApiError, joinGroup } from '../../lib/api';
import { extractInviteCode, formatInviteCode } from '../../lib/invite';
import { useOnlineStatus } from '../../hooks/useUi';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icons';
import { Modal } from '../ui/Modal';

interface JoinGroupDialogProps {
  open: boolean;
  onClose: () => void;
  onJoined: (group: GroupSummary) => void;
}

export function JoinGroupDialog({ open, onClose, onJoined }: JoinGroupDialogProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const online = useOnlineStatus();

  useEffect(() => {
    if (!open) {
      setCode('');
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanCode = extractInviteCode(code);
    if (cleanCode.length < 4) {
      setError('Ingresá el código que te compartieron.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await joinGroup(cleanCode);
      onJoined(result.group);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError('No pudimos unirnos al grupo. Intentá de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Unirme a un grupo"
      eyebrow="Ya tengo una invitación"
      description="Pegá el código o el enlace que te compartieron."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="join-group-form"
            loading={loading}
            disabled={!online}
          >
            Entrar al grupo
          </Button>
        </>
      }
    >
      <form id="join-group-form" onSubmit={handleSubmit} className="form-stack">
        <label className="field">
          <span className="field__label">Código de invitación</span>
          <span className="input-wrap">
            <Icon name="link" size={18} className="input-wrap__icon" />
            <input
              className="input input--code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABCD-EFGH"
              maxLength={80}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              data-autofocus
            />
          </span>
          {code ? (
            <span className="field__hint">Código: {formatInviteCode(extractInviteCode(code))}</span>
          ) : null}
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        {!online ? (
          <p className="form-note form-note--warn">
            Sin conexión. Unirte a un grupo requiere conexión.
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
