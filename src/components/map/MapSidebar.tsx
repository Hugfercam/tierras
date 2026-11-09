import type { GroupMember, GroupOverview } from '../../../shared/types.ts';
import { memberColor } from '../../lib/colors';
import { cn } from '../../lib/cn';
import { formatInteger, formatKm } from '../../lib/format';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icons';
import { InfoTip } from '../ui/InfoTip';

interface MapSidebarProps {
  overview: GroupOverview;
  layer: string;
  onLayerChange: (layer: string) => void;
  currentUserId: string;
  onMarkCountry: () => void;
  groupName: string;
  showCities: boolean;
  cityCount: number;
  onToggleCities: () => void;
}

export function MapSidebar({
  overview,
  layer,
  onLayerChange,
  currentUserId,
  onMarkCountry,
  groupName,
  showCities,
  cityCount,
  onToggleCities,
}: MapSidebarProps) {
  const selectedMember = overview.members.find((member) => member.id === layer) ?? null;
  const memberVisits = (memberId: string) =>
    overview.visits.filter((visit) => visit.userId === memberId).length;

  return (
    <aside className="map-sidebar" aria-label="Controles del mapa">
      <div className="map-sidebar__intro">
        <p className="eyebrow">
          <span className="eyebrow__line" />
          Vista del grupo
        </p>
        <h2>{groupName}</h2>
        <p>
          {selectedMember
            ? `Estás viendo el recorrido de ${selectedMember.name}.`
            : 'Estás viendo todos los países que el grupo ya marcó.'}
        </p>
        <Button full onClick={onMarkCountry}>
          <Icon name="plus" size={19} />
          Marcar un país
        </Button>
      </div>

      <section className="map-panel">
        <div className="map-panel__head">
          <h3>Capas del mapa</h3>
          <span>{formatInteger(overview.members.length)} viajeros</span>
        </div>

        <div className="layer-list" role="radiogroup" aria-label="Capa del mapa">
          <button
            type="button"
            role="radio"
            aria-checked={layer === 'group'}
            className={cn('layer-option', layer === 'group' && 'is-active')}
            onClick={() => onLayerChange('group')}
          >
            <span className="layer-option__swatch layer-option__swatch--group" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className="layer-option__copy">
              <strong>Todo el grupo</strong>
              <small>
                {formatInteger(overview.stats.countries)} países · color por coincidencia
              </small>
            </span>
            <span className="layer-option__radio" aria-hidden="true">
              {layer === 'group' ? <span /> : null}
            </span>
          </button>

          {overview.members.map((member, index) => (
            <MemberLayer
              key={member.id}
              member={member}
              index={index}
              count={memberVisits(member.id)}
              active={layer === member.id}
              isMe={member.id === currentUserId}
              onClick={() => onLayerChange(member.id)}
            />
          ))}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={showCities}
          className={cn('city-layer-toggle', showCities && 'is-on')}
          onClick={onToggleCities}
        >
          <span className="city-layer-toggle__icon">
            <Icon name="locate" size={15} />
          </span>
          <span className="city-layer-toggle__copy">
            <strong>Ciudades visitadas</strong>
            <small>
              {cityCount} {cityCount === 1 ? 'punto en el mapa' : 'puntos en el mapa'}
            </small>
          </span>
          <span className="city-layer-toggle__switch" aria-hidden="true">
            <span />
          </span>
        </button>
      </section>

      <section className="map-panel map-panel--stats">
        <div className="map-panel__head">
          <h3>El grupo en números</h3>
          <span>En este mapa</span>
        </div>
        <div className="mini-stats">
          <div>
            <strong>{formatInteger(overview.stats.countries)}</strong>
            <span>países distintos</span>
          </div>
          <div>
            <strong>{formatInteger(overview.stats.continents)}</strong>
            <span>continentes</span>
          </div>
          <div>
            <strong>{formatInteger(overview.stats.visits)}</strong>
            <span>marcas totales</span>
          </div>
          <div>
            <strong>{formatKm(overview.stats.kilometers)}</strong>
            <span>km estimados</span>
            <InfoTip text="Es la suma de los kilómetros estimados de cada miembro. Se calculan uniendo sus puntos de visita en orden de fecha, partiendo de su punto en el país base." />
          </div>
        </div>
      </section>

      <section className="map-legend">
        <div className="map-legend__head">
          <Icon name={selectedMember ? 'route' : 'globe'} size={17} />
          <h3>{selectedMember ? `Países de ${selectedMember.name.split(' ')[0]}` : 'Cómo leer el color'}</h3>
        </div>
        {selectedMember ? (
          <div className="map-legend__member">
            <span
              className="map-legend__member-dot"
              style={{
                backgroundColor: memberColor(
                  overview.members.findIndex((member) => member.id === selectedMember.id),
                ),
              }}
            />
            <p>
              {formatInteger(selectedMember.stats.countries)} países marcados por{' '}
              {selectedMember.name.split(' ')[0]}.
            </p>
          </div>
        ) : (
          <>
            <div className="heat-scale" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="heat-labels">
              <span>1 viajero</span>
              <span>2</span>
              <span>3</span>
              <span>4+</span>
            </div>
            <p>
              Cuanto más cálido el país, más personas del grupo ya lo marcaron. Tocá un país para
              ver quién estuvo.
            </p>
          </>
        )}
      </section>
    </aside>
  );
}

function MemberLayer({
  member,
  index,
  count,
  active,
  isMe,
  onClick,
}: {
  member: GroupMember;
  index: number;
  count: number;
  active: boolean;
  isMe: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      className={cn('layer-option', active && 'is-active')}
      onClick={onClick}
    >
      <Avatar name={member.name} index={index} size="xs" />
      <span className="layer-option__copy">
        <strong>
          {member.name}
          {isMe ? <span className="you-tag">Vos</span> : null}
        </strong>
        <small>
          {formatInteger(count)} {count === 1 ? 'país' : 'países'}
        </small>
      </span>
      <span
        className="layer-option__dot"
        style={{ backgroundColor: memberColor(index) }}
        aria-hidden="true"
      />
      <span className="layer-option__radio" aria-hidden="true">
        {active ? <span /> : null}
      </span>
    </button>
  );
}
