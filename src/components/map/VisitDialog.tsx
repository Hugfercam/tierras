import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PlaceResult, Visit } from '../../../shared/types.ts';
import { useGroup } from '../../contexts/GroupContext';
import { useToast } from '../../contexts/ToastContext';
import { useOnlineStatus } from '../../hooks/useUi';
import { ApiError, addVisit } from '../../lib/api';
import { countryToPlace } from '../../lib/places';
import { todayIso } from '../../lib/format';
import { PlaceSearch } from './PlaceSearch';
import { Button } from '../ui/Button';
import { CountryFlag } from '../ui/CountryFlag';
import { Icon } from '../ui/Icons';
import { Modal } from '../ui/Modal';

interface VisitDialogProps {
  open: boolean;
  initialPlace?: PlaceResult | null;
  initialCountryCode?: string | null;
  onClose: () => void;
  onSaved: (visit: Visit) => void;
}

export function VisitDialog({
  open,
  initialPlace = null,
  initialCountryCode = null,
  onClose,
  onSaved,
}: VisitDialogProps) {
  const { activeGroup, activeGroupId } = useGroup();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [selected, setSelected] = useState<PlaceResult | null>(null);
  const [visitedAt, setVisitedAt] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(initialPlace ?? countryToPlace(initialCountryCode ?? ''));
    setVisitedAt(todayIso());
    setError(null);
    setSaving(false);
  }, [initialCountryCode, initialPlace, open]);

  if (!open || !activeGroup || !activeGroupId) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setError('Elige un país o una ciudad.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await addVisit(activeGroupId, {
        countryCode: selected.countryCode,
        cityName: selected.type === 'city' ? selected.name : null,
        lat: selected.lat,
        lng: selected.lng,
        visitedAt,
      });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['group', activeGroupId, 'overview'],
        }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
      ]);
      toast(`${selected.name} ya está en tu mapa.`, 'success');
      onSaved(result.visit);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(
          caught.code === 'ALREADY_VISITED'
            ? 'Ya marcaste este país en este grupo. Puedes quitarlo desde la ficha del país.'
            : caught.message,
        );
      } else {
        setError('No pudimos guardar la visita. Intenta de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Marcar un país"
      eyebrow="Sumar al recorrido"
      description={`Se guarda en el mapa de ${activeGroup.name}.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="visit-form"
            loading={saving}
            disabled={!online || !selected}
          >
            <Icon name="check" size={17} />
            Guardar país
          </Button>
        </>
      }
    >
      <form id="visit-form" className="form-stack" onSubmit={handleSubmit}>
        <div className="field">
          <span className="field__label">Lugar</span>
          {selected ? (
            <div className="selected-place">
              <span className="selected-place__flag">
                <CountryFlag code={selected.countryCode} size="md" />
              </span>
              <span className="selected-place__copy">
                <strong>{selected.name}</strong>
                <small>{selected.subtitle}</small>
              </span>
              <span className="selected-place__type">
                {selected.type === 'country' ? 'País' : 'Ciudad'}
              </span>
              <button
                type="button"
                className="selected-place__change"
                onClick={() => setSelected(null)}
              >
                Cambiar
              </button>
            </div>
          ) : (
            <PlaceSearch
              autoFocus
              onSelect={(place) => setSelected(place)}
              placeholder="¿A qué país o ciudad fuiste?"
              ariaLabel="Buscar el lugar visitado"
            />
          )}
          <span className="field__hint">
            Si eliges una ciudad, se usa como punto para estimar los kilómetros.
          </span>
        </div>

        <label className="field">
          <span className="field__label">Primera visita</span>
          <span className="input-wrap">
            <Icon name="calendar" size={18} className="input-wrap__icon" />
            <input
              type="date"
              className="input"
              value={visitedAt}
              max={todayIso()}
              onChange={(event) => setVisitedAt(event.target.value)}
              required
            />
          </span>
          <span className="field__hint">
            La fecha ordena tus países y define el recorrido con el que se calculan los km.
          </span>
        </label>

        {error ? (
          <p className="form-error" role="alert">
            <Icon name="info" size={16} />
            {error}
          </p>
        ) : null}

        {!online ? (
          <p className="form-note form-note--warn">
            Sin conexión. Para guardar una visita necesitas volver a estar online.
          </p>
        ) : (
          <p className="form-note">
            <Icon name="route" size={15} /> Un país por persona y grupo. La distancia se estima
            desde tu punto en el país base hasta los lugares que marcaste.
          </p>
        )}
      </form>
    </Modal>
  );
}
