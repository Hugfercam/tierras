import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Visit } from '../../../shared/types.ts';
import { useToast } from '../../contexts/ToastContext';
import { ApiError, addVisitCity, removeVisitCity } from '../../lib/api';
import { normalizeText } from '../../lib/format';
import { searchCitiesInCountry } from '../../lib/places';
import { cn } from '../../lib/cn';
import { Icon } from '../ui/Icons';

interface VisitCitiesProps {
  groupId: string;
  visit: Visit;
  countryCode: string;
  editable: boolean;
  online: boolean;
}

export function VisitCities({
  groupId,
  visit,
  countryCode,
  editable,
  online,
}: VisitCitiesProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busyName, setBusyName] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cities = visit.cities ?? [];
  const existingNames = useMemo(
    () => new Set(cities.map((city) => normalizeText(city.name))),
    [cities],
  );
  const existingCoords = useMemo(
    () =>
      cities.filter(
        (city): city is typeof city & { lat: number; lng: number } =>
          city.lat !== null && city.lng !== null,
      ),
    [cities],
  );

  const isDuplicate = (name: string, lat?: number, lng?: number): boolean => {
    if (existingNames.has(normalizeText(name))) return true;
    if (lat === undefined || lng === undefined) return false;
    return existingCoords.some(
      (city) => Math.abs(city.lat - lat) < 0.01 && Math.abs(city.lng - lng) < 0.01,
    );
  };

  const knownMatches = useMemo(
    () => searchCitiesInCountry(query, countryCode),
    [countryCode, query],
  );
  const suggestions = useMemo(
    () =>
      knownMatches.filter(
        (place) => !isDuplicate(place.name, place.lat, place.lng),
      ),
    [knownMatches, existingCoords, existingNames],
  );

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['group', groupId, 'overview'] });

  const addCity = async (name: string, lat?: number, lng?: number) => {
    if (!name.trim() || !online) return;
    if (isDuplicate(name, lat, lng)) {
      setError('Esa ciudad ya está en la lista.');
      return;
    }
    setBusyName(name);
    setError(null);
    try {
      await addVisitCity(groupId, visit.id, {
        name: name.trim(),
        ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
      });
      await refresh();
      setQuery('');
      inputRef.current?.focus();
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.code === 'CITY_ALREADY_ADDED'
            ? 'Esa ciudad ya está en la lista.'
            : caught.message
          : 'No pudimos guardar la ciudad.';
      setError(message);
      toast(message, 'error');
    } finally {
      setBusyName(null);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const typed = query.trim();
    if (!typed) return;
    const suggestion = suggestions[0] ?? knownMatches[0];
    if (suggestion) {
      void addCity(suggestion.name, suggestion.lat, suggestion.lng);
    } else {
      void addCity(typed);
    }
  };

  const handleRemove = async (cityId: string, name: string) => {
    if (!online) return;
    setRemovingId(cityId);
    setError(null);
    try {
      await removeVisitCity(groupId, visit.id, cityId);
      await refresh();
    } catch (caught) {
      toast(
        caught instanceof ApiError ? caught.message : `No pudimos quitar ${name}.`,
        'error',
      );
    } finally {
      setRemovingId(null);
    }
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
      setQuery('');
      setError(null);
    }
  };

  if (!editable && cities.length === 0) return null;

  return (
    <div className="visit-cities">
      <div className="city-list">
        {cities.map((city) => (
          <span className="city-chip" key={city.id}>
            {city.name}
            {editable ? (
              <button
                type="button"
                className="city-chip__remove"
                aria-label={`Quitar ${city.name}`}
                title={online ? `Quitar ${city.name}` : 'Necesitas conexión'}
                disabled={!online || removingId === city.id}
                onClick={() => handleRemove(city.id, city.name)}
              >
                {removingId === city.id ? (
                  <span className="city-chip__spinner" aria-hidden="true" />
                ) : (
                  <Icon name="close" size={11} />
                )}
              </button>
            ) : null}
          </span>
        ))}

        {editable ? (
          <button
            type="button"
            className={cn('city-chip city-chip--add', open && 'is-open')}
            onClick={() => {
              setOpen((value) => !value);
              setError(null);
            }}
            disabled={!online}
            title={online ? 'Añadir una ciudad' : 'Necesitas conexión'}
          >
            <Icon name="plus" size={12} />
            {open ? 'Cerrar' : 'Añadir ciudad'}
          </button>
        ) : null}
      </div>

      {editable && open ? (
        <div className="city-editor">
          <form className="city-editor__form" onSubmit={handleSubmit}>
            <span className="city-editor__icon">
              <Icon name="search" size={16} />
            </span>
            <input
              ref={inputRef}
              className="city-editor__input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setError(null);
              }}
              onKeyDown={handleEditorKeyDown}
              placeholder="Buscar una ciudad…"
              maxLength={80}
              autoComplete="off"
              spellCheck={false}
              disabled={busyName !== null || !online}
              aria-label="Buscar una ciudad para añadir"
            />
            <button
              type="submit"
              className="city-editor__submit"
              disabled={!query.trim() || busyName !== null || !online}
            >
              {busyName ? <span className="city-chip__spinner" /> : 'Añadir'}
            </button>
          </form>

          {suggestions.length > 0 ? (
            <ul className="city-suggestions">
              {suggestions.slice(0, 6).map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => void addCity(place.name, place.lat, place.lng)}
                    disabled={busyName !== null}
                  >
                    <span className="city-suggestions__dot" />
                    <span>
                      <strong>{place.name}</strong>
                      <small>{place.subtitle}</small>
                    </span>
                    <Icon name="plus" size={13} />
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() ? (
            knownMatches.length > 0 ? (
              <p className="city-editor__error">Esa ciudad ya está en la lista.</p>
            ) : (
              <p className="city-editor__empty">
                No está en el buscador. <strong>Enter</strong> para añadir “{query.trim()}”.
              </p>
            )
          ) : (
            <p className="city-editor__hint">
              Las del buscador se guardan con coordenadas; también puedes escribir una localidad
              libre. Las ciudades no modifican los km estimados del país.
            </p>
          )}

          {error ? <p className="city-editor__error">{error}</p> : null}
          {!online ? (
            <p className="city-editor__error">Necesitas conexión para editar ciudades.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
