import { getCountry, regionLabel } from '../../../shared/countries.ts';
import type { GroupMember, PlaceResult, Visit } from '../../../shared/types.ts';
import { formatDate } from '../../lib/format';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { CountryFlag } from '../ui/CountryFlag';
import { Icon } from '../ui/Icons';
import { Modal } from '../ui/Modal';
import { VisitCities } from './VisitCities';

interface CountryDialogProps {
  groupId: string;
  countryCode: string;
  spotlight: PlaceResult | null;
  visits: Visit[];
  members: GroupMember[];
  currentUserId: string;
  groupName: string;
  online: boolean;
  onClose: () => void;
  onMark: () => void;
  onRemove: (visit: Visit) => void;
}

export function CountryDialog({
  groupId,
  countryCode,
  spotlight,
  visits,
  members,
  currentUserId,
  groupName,
  online,
  onClose,
  onMark,
  onRemove,
}: CountryDialogProps) {
  const country = getCountry(countryCode);
  if (!country) return null;

  const countryVisits = visits
    .filter((visit) => visit.countryCode === countryCode)
    .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
  const ownVisit = countryVisits.find((visit) => visit.userId === currentUserId) ?? null;
  const memberById = new Map(members.map((member, index) => [member.id, { member, index }]));
  const cityInFocus =
    spotlight?.type === 'city' && spotlight.countryCode === countryCode ? spotlight : null;

  return (
    <Modal
      title={country.name}
      eyebrow={regionLabel(country.region)}
      description={
        countryVisits.length === 0
          ? 'Todavía nadie del grupo lo marcó.'
          : `${countryVisits.length} ${
              countryVisits.length === 1
                ? 'viajero del grupo ya lo marcó'
                : 'viajeros del grupo ya lo marcaron'
            }.`
      }
      onClose={onClose}
      size="md"
      footer={
        ownVisit ? (
          <>
            <span className="country-dialog__own">
              <Icon name="check" size={15} /> Marcado por ti
            </span>
            <Button variant="ghost" onClick={() => onRemove(ownVisit)} disabled={!online}>
              <Icon name="trash" size={16} />
              Quitar mi marca
            </Button>
          </>
        ) : (
          <>
            <span className="country-dialog__offline-hint">
              {online ? 'Se sumará a tu recorrido en este grupo.' : 'Necesitas conexión para marcar.'}
            </span>
            <Button onClick={onMark} disabled={!online}>
              <Icon name="plus" size={17} />
              Marcar que estuve
            </Button>
          </>
        )
      }
    >
      <div className="country-dialog">
        <div className="country-dialog__hero">
          <span className="country-dialog__flag" aria-hidden="true">
            <CountryFlag code={country.iso2} size="hero" />
          </span>
          <div className="country-dialog__facts">
            <div>
              <span>Continente</span>
              <strong>{regionLabel(country.region)}</strong>
            </div>
            <div>
              <span>Capital</span>
              <strong>{country.capital ?? '—'}</strong>
            </div>
            <div>
              <span>En {groupName}</span>
              <strong>
                {countryVisits.length} de {members.length}
              </strong>
            </div>
          </div>
        </div>

        {cityInFocus ? (
          <div className="country-dialog__spotlight">
            <span className="country-dialog__spotlight-icon">
              <Icon name="locate" size={17} />
            </span>
            <div>
              <span>Resultado de tu búsqueda</span>
              <strong>
                {cityInFocus.name}, {country.name}
              </strong>
            </div>
          </div>
        ) : null}

        <div className="country-dialog__section-head">
          <h3>Quiénes lo visitaron</h3>
          <span>{countryVisits.length > 0 ? 'Ordenado por fecha' : 'Todavía nadie'}</span>
        </div>

        {countryVisits.length > 0 ? (
          <ul className="visitor-list">
            {countryVisits.map((visit) => {
              const entry = memberById.get(visit.userId);
              if (!entry) return null;
              return (
                <li key={visit.id} className="visitor-row">
                  <Avatar name={entry.member.name} index={entry.index} size="sm" />
                  <div className="visitor-row__copy">
                    <strong>
                      {entry.member.name}
                      {visit.userId === currentUserId ? <span className="you-tag">Tú</span> : null}
                    </strong>
                    <span className="visitor-row__date">{formatDate(visit.visitedAt)}</span>
                    <VisitCities
                      groupId={groupId}
                      visit={visit}
                      countryCode={countryCode}
                      editable={visit.userId === currentUserId}
                      online={online}
                    />
                  </div>
                  <span
                    className="visitor-row__flag"
                    title={`Base en ${entry.member.homeCountryCode}`}
                  >
                    <CountryFlag code={entry.member.homeCountryCode} size="xs" />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="country-dialog__empty">
            <Icon name="globe" size={24} />
            <p>Este país todavía no está en el mapa de {groupName}.</p>
            <span>Puedes ser la primera persona en sumarlo.</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
