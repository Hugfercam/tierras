import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { PlaceResult } from '../../../shared/types.ts';
import { useClickOutside } from '../../hooks/useUi';
import { cn } from '../../lib/cn';
import { searchPlaces } from '../../lib/places';
import { CountryFlag } from '../ui/CountryFlag';
import { Icon } from '../ui/Icons';

interface PlaceSearchProps {
  onSelect: (place: PlaceResult) => void;
  onClear?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  ariaLabel?: string;
  initialQuery?: string;
}

export function PlaceSearch({
  onSelect,
  onClear,
  placeholder = 'Buscar un país o una ciudad…',
  autoFocus = false,
  className,
  ariaLabel = 'Buscar lugares',
  initialQuery = '',
}: PlaceSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => searchPlaces(deferredQuery, 9), [deferredQuery]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useClickOutside(wrapperRef, () => setOpen(false), open);

  useEffect(() => {
    if (activeIndex < 0) return;
    const active = document.getElementById(`${listId}-option-${activeIndex}`);
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, listId]);

  const selectPlace = (place: PlaceResult) => {
    setQuery(place.name);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(place);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const place = results[activeIndex >= 0 ? activeIndex : 0];
      if (place) selectPlace(place);
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  };

  const showEmpty = open && deferredQuery.trim().length > 0 && results.length === 0;

  return (
    <div className={cn('place-search', className)} ref={wrapperRef}>
      <div className={cn('place-search__field', open && 'is-open')}>
        <Icon name="search" size={19} className="place-search__icon" />
        <input
          ref={inputRef}
          type="text"
          className="place-search__input"
          value={query}
          placeholder={placeholder}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
          }
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="place-search__clear"
            aria-label="Limpiar búsqueda"
            onClick={() => {
              setQuery('');
              setOpen(false);
              onClear?.();
              inputRef.current?.focus();
            }}
          >
            <Icon name="close" size={15} />
          </button>
        ) : (
          <span className="place-search__key" aria-hidden="true">
            ⌕
          </span>
        )}
      </div>

      {open && (results.length > 0 || showEmpty) ? (
        <div className="place-results" id={listId} role="listbox" aria-label="Resultados">
          {showEmpty ? (
            <div className="place-results__empty">
              <Icon name="search" size={18} />
              <p>No encontramos “{deferredQuery.trim()}”.</p>
              <span>Prueba con otro nombre o usa el nombre en inglés.</span>
            </div>
          ) : (
            results.map((place, index) => (
              <button
                key={place.id}
                id={`${listId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn('place-result', index === activeIndex && 'is-active')}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectPlace(place)}
              >
                <span className="place-result__flag">
                  <CountryFlag code={place.countryCode} size="sm" />
                </span>
                <span className="place-result__copy">
                  <span className="place-result__name">{place.name}</span>
                  <span className="place-result__subtitle">{place.subtitle}</span>
                </span>
                <span className={cn('place-result__type', `is-${place.type}`)}>
                  {place.type === 'country' ? 'País' : 'Ciudad'}
                </span>
                <Icon name="arrow-right" size={15} className="place-result__arrow" />
              </button>
            ))
          )}
          <div className="place-results__foot">
            <span>Buscador local · funciona sin conexión</span>
            <span className="place-results__keys">
              <kbd>↑</kbd>
              <kbd>↓</kbd>
              <kbd>↵</kbd>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
