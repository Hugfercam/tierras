import { useRef, useState } from 'react';
import { useClickOutside } from '../../hooks/useUi';
import { useGroup } from '../../contexts/GroupContext';
import { cn } from '../../lib/cn';
import { Icon } from '../ui/Icons';

export function GroupSwitcher() {
  const { groups, activeGroup, setActiveGroupId, openCreateGroup, openJoinGroup } = useGroup();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div className="group-switcher" ref={ref}>
      <button
        type="button"
        className={cn('group-switcher__trigger', open && 'is-open')}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="group-switcher__icon">
          <Icon name="users" size={16} />
        </span>
        <span className="group-switcher__copy">
          <span className="group-switcher__label">Grupo</span>
          <span className="group-switcher__name">{activeGroup?.name ?? 'Sin grupo'}</span>
        </span>
        <Icon name="chevron-down" size={15} className="group-switcher__chevron" />
      </button>

      {open ? (
        <div className="popover group-switcher__menu" role="menu">
          <p className="popover__eyebrow">Tus mapas compartidos</p>
          {groups.length > 0 ? (
            <div className="group-switcher__list">
              {groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={group.id === activeGroup?.id}
                  className={cn(
                    'group-switcher__option',
                    group.id === activeGroup?.id && 'is-active',
                  )}
                  onClick={() => {
                    setActiveGroupId(group.id);
                    setOpen(false);
                  }}
                >
                  <span className="group-switcher__option-mark" aria-hidden="true">
                    {group.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="group-switcher__option-copy">
                    <span>{group.name}</span>
                    <small>
                      {group.memberCount} {group.memberCount === 1 ? 'viajero' : 'viajeros'} ·{' '}
                      {group.countryCount} {group.countryCount === 1 ? 'país' : 'países'}
                    </small>
                  </span>
                  {group.id === activeGroup?.id ? (
                    <Icon name="check" size={16} className="group-switcher__check" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="group-switcher__empty">Todavía no tenés ningún grupo.</p>
          )}
          <div className="popover__divider" />
          <button
            type="button"
            className="popover__action"
            onClick={() => {
              setOpen(false);
              openCreateGroup();
            }}
          >
            <Icon name="plus" size={17} />
            Crear un grupo
          </button>
          <button
            type="button"
            className="popover__action"
            onClick={() => {
              setOpen(false);
              openJoinGroup();
            }}
          >
            <Icon name="link" size={17} />
            Unirme con un código
          </button>
        </div>
      ) : null}
    </div>
  );
}
