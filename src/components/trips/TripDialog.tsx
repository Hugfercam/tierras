import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getCountry } from '../../../shared/countries.ts';
import type {
  PlaceResult,
  Trip,
  TripParticipantStatus,
  TripVisibility,
} from '../../../shared/types.ts';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup } from '../../contexts/GroupContext';
import { useToast } from '../../contexts/ToastContext';
import { useOnlineStatus } from '../../hooks/useUi';
import { ApiError, createTrip, updateTrip } from '../../lib/api';
import { countryToPlace } from '../../lib/places';
import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { CountryFlag } from '../ui/CountryFlag';
import { Icon } from '../ui/Icons';
import { Modal } from '../ui/Modal';
import { PlaceSearch } from '../map/PlaceSearch';

interface TripDialogProps {
  open: boolean;
  trip?: Trip | null;
  initialPlace?: PlaceResult | null;
  initialCountryCode?: string | null;
  onClose: () => void;
  onSaved: (trip: Trip) => void;
}

interface DraftStop {
  key: string;
  countryCode: string;
  cityName: string | null;
  lat?: number;
  lng?: number;
  startDate: string;
  endDate: string;
  note: string;
}

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `stop-${Math.random().toString(36).slice(2)}`;
}

function stopFromPlace(place: PlaceResult): DraftStop {
  return {
    key: newKey(),
    countryCode: place.countryCode,
    cityName: place.type === 'city' ? place.name : null,
    lat: place.lat,
    lng: place.lng,
    startDate: '',
    endDate: '',
    note: '',
  };
}

function stopFromTrip(stop: Trip['stops'][number]): DraftStop {
  return {
    key: stop.id,
    countryCode: stop.countryCode,
    cityName: stop.cityName,
    lat: stop.lat ?? undefined,
    lng: stop.lng ?? undefined,
    startDate: stop.startDate ?? '',
    endDate: stop.endDate ?? '',
    note: stop.note ?? '',
  };
}

export function TripDialog({
  open,
  trip = null,
  initialPlace = null,
  initialCountryCode = null,
  onClose,
  onSaved,
}: TripDialogProps) {
  const { user } = useAuth();
  const { activeGroupId, overview } = useGroup();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [visibility, setVisibility] = useState<TripVisibility>('private');
  const [stops, setStops] = useState<DraftStop[]>([]);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const people = useMemo(() => {
    const byId = new Map<
      string,
      { id: string; name: string; status?: TripParticipantStatus }
    >();
    const statusById = new Map(
      (trip?.participants ?? []).map((participant) => [participant.id, participant.status]),
    );
    for (const member of overview?.members ?? []) {
      if (member.id !== user?.id) {
        byId.set(member.id, {
          id: member.id,
          name: member.name,
          status: statusById.get(member.id),
        });
      }
    }
    for (const participant of trip?.participants ?? []) {
      if (participant.id !== user?.id) {
        byId.set(participant.id, {
          id: participant.id,
          name: participant.name,
          status: participant.status,
        });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [overview?.members, trip?.participants, user?.id]);

  useEffect(() => {
    if (!open) return;
    if (trip) {
      setTitle(trip.title);
      setStartDate(trip.startDate);
      setEndDate(trip.endDate);
      setVisibility(trip.visibility);
      setStops(trip.stops.map(stopFromTrip));
      setParticipantIds(
        trip.participants
          .filter(
            (participant) =>
              participant.id !== user?.id && participant.status !== 'rejected',
          )
          .map((participant) => participant.id),
      );
    } else {
      const place = initialPlace ?? countryToPlace(initialCountryCode ?? '');
      setTitle('');
      setStartDate('');
      setEndDate('');
      setVisibility('private');
      setStops(place ? [stopFromPlace(place)] : []);
      setParticipantIds([]);
    }
    setError(null);
    setSaving(false);
  }, [initialCountryCode, initialPlace, open, trip, user?.id]);

  if (!open) return null;

  const addPlace = (place: PlaceResult) => {
    const cityName = place.type === 'city' ? place.name : null;
    const duplicate = stops.some(
      (stop) =>
        stop.countryCode === place.countryCode &&
        (stop.cityName ?? '').toLocaleLowerCase('es') ===
          (cityName ?? '').toLocaleLowerCase('es'),
    );
    if (duplicate) {
      setError('Esa parada ya está en el viaje.');
      return;
    }
    setStops((current) => [...current, stopFromPlace(place)]);
    setError(null);
  };

  const updateStop = (key: string, patch: Partial<DraftStop>) => {
    setStops((current) => current.map((stop) => (stop.key === key ? { ...stop, ...patch } : stop)));
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    if (endDate && value && endDate < value) setEndDate(value);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!startDate || !endDate) {
      setError('Elige la fecha de inicio y la de fin del viaje.');
      return;
    }
    if (stops.length === 0) {
      setError('Añade al menos una parada al viaje.');
      return;
    }
    if (startDate > endDate) {
      setError('La fecha de fin no puede ser anterior a la fecha de inicio.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = {
        title: title.trim() || null,
        startDate,
        endDate,
        visibility,
        stops: stops.map((stop) => ({
          countryCode: stop.countryCode,
          cityName: stop.cityName,
          ...(stop.lat !== undefined && stop.lng !== undefined
            ? { lat: stop.lat, lng: stop.lng }
            : {}),
          startDate: stop.startDate || null,
          endDate: stop.endDate || null,
          note: stop.note || null,
        })),
        participantIds,
      };
      const result = trip
        ? await updateTrip(trip.id, input)
        : await createTrip(input);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['personal', 'overview'] }),
        queryClient.invalidateQueries({ queryKey: ['trips'] }),
        queryClient.invalidateQueries({ queryKey: ['groups'] }),
        activeGroupId
          ? queryClient.invalidateQueries({ queryKey: ['group', activeGroupId, 'overview'] })
          : Promise.resolve(),
      ]);
      toast(trip ? 'Viaje actualizado.' : 'Viaje añadido a tu pasaporte.', 'success');
      onSaved(result.trip);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'No pudimos guardar el viaje. Intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={trip ? 'Editar viaje' : 'Nuevo viaje'}
      eyebrow={trip ? 'Actualizar itinerario' : 'Añadir al pasaporte'}
      description="Un viaje puede incluir varios países y paradas. Las personas participantes suman estos países a su pasaporte cuando aceptan la invitación."
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="trip-form"
            loading={saving}
            disabled={!online || stops.length === 0}
          >
            <Icon name="check" size={17} />
            {trip ? 'Guardar cambios' : 'Guardar viaje'}
          </Button>
        </>
      }
    >
      <form id="trip-form" className="form-stack" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field">
            <span className="field__label">Título</span>
            <input
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Bélgica en otoño"
              maxLength={100}
            />
          </label>
          <div className="field">
            <span className="field__label">Fechas</span>
            <div className="trip-date-range">
              <input
                type="date"
                className="input"
                aria-label="Fecha de inicio"
                value={startDate}
                onChange={(event) => handleStartDateChange(event.target.value)}
                required
              />
              <span>→</span>
              <input
                type="date"
                className="input"
                aria-label="Fecha de fin"
                value={endDate}
                min={startDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
              />
            </div>
            <span className="field__hint">
              Puedes registrar un viaje pasado o planificar uno futuro.
            </span>
          </div>
        </div>

          <div className="field">
            <span className="field__label">¿Quién puede verlo?</span>
            <div className="visibility-picker" role="radiogroup" aria-label="Visibilidad del viaje">
              <label className={cn('visibility-option', visibility === 'private' && 'is-active')}>
                <input
                  type="radio"
                  name="trip-visibility"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                />
                <Icon name="lock" size={17} />
                <span>
                  <strong>Solo para mí</strong>
                  <small>No aparece en el mapa ni en el ranking de tus grupos.</small>
                </span>
              </label>
              <label className={cn('visibility-option', visibility === 'group' && 'is-active')}>
                <input
                  type="radio"
                  name="trip-visibility"
                  checked={visibility === 'group'}
                  onChange={() => setVisibility('group')}
                />
                <Icon name="users" size={17} />
                <span>
                  <strong>Visible en grupos</strong>
                  <small>Solo lo ven las personas de tus grupos.</small>
                </span>
              </label>
            </div>
          </div>

        <div className="field">
          <span className="field__label">Paradas</span>
          <div className="trip-stop-search">
            <PlaceSearch
              onSelect={addPlace}
              placeholder="Busca un país o una ciudad para añadir"
              ariaLabel="Buscar una parada"
            />
          </div>
          {stops.length > 0 ? (
            <ul className="trip-stop-list">
              {stops.map((stop, index) => {
                const country = getCountry(stop.countryCode);
                return (
                  <li className="trip-stop" key={stop.key}>
                    <span className="trip-stop__index">{index + 1}</span>
                    <span className="trip-stop__flag">
                      <CountryFlag code={stop.countryCode} size="sm" />
                    </span>
                    <span className="trip-stop__copy">
                      <strong>{stop.cityName ?? country?.name ?? stop.countryCode}</strong>
                      <small>
                        {stop.cityName ? `${country?.name ?? stop.countryCode} · ` : ''}
                        Parada {index + 1}
                      </small>
                    </span>
                    <div className="trip-stop__dates">
                      <input
                        type="date"
                        className="input input--mini"
                        aria-label={`Fecha de llegada a ${stop.cityName ?? country?.name ?? stop.countryCode}`}
                        value={stop.startDate}
                        min={startDate}
                        max={endDate}
                        onChange={(event) =>
                          updateStop(stop.key, { startDate: event.target.value })
                        }
                      />
                      <input
                        type="date"
                        className="input input--mini"
                        aria-label={`Fecha de salida de ${stop.cityName ?? country?.name ?? stop.countryCode}`}
                        value={stop.endDate}
                        min={stop.startDate || startDate}
                        max={endDate}
                        onChange={(event) => updateStop(stop.key, { endDate: event.target.value })}
                      />
                    </div>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() =>
                        setStops((current) => current.filter((item) => item.key !== stop.key))
                      }
                      aria-label={`Quitar ${stop.cityName ?? country?.name ?? stop.countryCode}`}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                    <input
                      className="input input--note"
                      value={stop.note}
                      onChange={(event) => updateStop(stop.key, { note: event.target.value })}
                      placeholder="Una nota o recuerdo de esta parada"
                      maxLength={500}
                    />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="field__hint">Busca el primer destino para empezar el itinerario.</p>
          )}
          <span className="field__hint">
            El orden de las paradas se guarda tal como aparece aquí. Las fechas por parada son
            opcionales.
          </span>
        </div>

        {people.length > 0 ? (
          <fieldset className="participant-picker">
            <legend className="field__label">¿Con quién compartes este viaje?</legend>
            <p className="field__hint">
              Recibirán una invitación y solo contarán para su pasaporte cuando la acepten.
            </p>
            <div className="participant-picker__grid">
              {people.map((person) => {
                const checked = participantIds.includes(person.id);
                return (
                  <label
                    key={person.id}
                    className={cn('participant-option', checked && 'is-checked')}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setParticipantIds((current) =>
                          checked
                            ? current.filter((id) => id !== person.id)
                            : [...current, person.id],
                        )
                      }
                    />
                    <span className="participant-option__name">{person.name}</span>
                    {person.status ? (
                      <small
                        className={cn(
                          'participant-option__status',
                          `is-${person.status}`,
                        )}
                      >
                        {person.status === 'accepted'
                          ? 'Aceptado'
                          : person.status === 'pending'
                            ? 'Pendiente'
                            : 'Rechazó'}
                      </small>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : (
          <p className="form-note">
            <Icon name="users" size={15} /> Este viaje será solo tuyo. Para añadir participantes,
            comparte un grupo con esas personas.
          </p>
        )}

        {error ? (
          <p className="form-error" role="alert">
            <Icon name="info" size={16} />
            {error}
          </p>
        ) : null}

        {!online ? (
          <p className="form-note form-note--warn">
            Sin conexión. Para guardar un viaje necesitas volver a estar online.
          </p>
        ) : (
          <p className="form-note">
            <Icon name="route" size={15} /> Los kilómetros del ranking usan los países distintos y
            la fecha de inicio de su primer viaje. Las paradas no duplican países.
          </p>
        )}
      </form>
    </Modal>
  );
}
