import { Link } from 'react-router-dom';
import { getCountry } from '../../shared/countries.ts';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { useToast } from '../contexts/ToastContext';
import { copyText } from '../lib/clipboard';
import { formatInteger, formatJoinedDate, formatKm, formatMonthYear } from '../lib/format';
import { formatInviteCode, inviteLink } from '../lib/invite';
import { NoGroupState } from '../components/group/NoGroupState';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { CountryFlag } from '../components/ui/CountryFlag';
import { Icon } from '../components/ui/Icons';
import { PageError, PageLoader } from '../components/ui/PageState';

export function GroupPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    activeGroup,
    groupsLoading,
    groupsError,
    overview,
    overviewLoading,
    overviewError,
    refetchOverview,
    openCreateGroup,
    openJoinGroup,
  } = useGroup();

  if (groupsLoading) return <PageLoader label="Abriendo tu grupo…" />;
  if (groupsError) {
    return (
      <PageError
        title="No pudimos cargar el grupo."
        description="Revisa tu conexión y vuelve a intentarlo."
      />
    );
  }
  if (!activeGroup) {
    return (
      <div className="standalone-page">
        <NoGroupState compact />
      </div>
    );
  }
  if (overviewLoading && !overview) return <PageLoader label="Reuniendo a los viajeros…" />;
  if (overviewError || !overview) {
    return (
      <PageError
        title="No pudimos abrir este grupo."
        description="Revisa tu conexión o recarga los datos."
        onRetry={refetchOverview}
      />
    );
  }

  const code = activeGroup.inviteCode;
  const link = inviteLink(code);

  const copy = async (value: string, message: string) => {
    const success = await copyText(value);
    toast(success ? message : 'No pudimos copiar. Selecciona el código manualmente.', success ? 'success' : 'error');
  };

  const share = async () => {
    if (!('share' in navigator)) {
      await copy(link, 'Enlace de invitación copiado.');
      return;
    }
    try {
      await navigator.share({
        title: `Sumate a ${activeGroup.name} en Tierras`,
        text: `Estoy armando el mapa de viajes de ${activeGroup.name}. Entra con este enlace:`,
        url: link,
      });
    } catch {
      // La persona canceló el diálogo nativo: no hace falta avisar.
    }
  };

  const maxCountries = Math.max(...overview.members.map((member) => member.stats.countries), 1);

  return (
    <div className="page group-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__line" />
            El círculo
          </p>
          <h1>
            {activeGroup.name}
            <em>.</em>
          </h1>
          <p className="page-head__lede">
            Creado en {formatMonthYear(activeGroup.createdAt)}. {overview.members.length}{' '}
            {overview.members.length === 1 ? 'persona' : 'personas'} compartiendo el mismo mapa.
          </p>
        </div>
        <div className="page-head__actions">
          <Button variant="secondary" onClick={openJoinGroup}>
            <Icon name="link" size={17} />
            Unirme a otro
          </Button>
          <Button onClick={openCreateGroup}>
            <Icon name="plus" size={17} />
            Crear otro grupo
          </Button>
        </div>
      </header>

      <section className="invite-card">
        <div className="invite-card__copy">
          <p className="eyebrow eyebrow--light">
            <span className="eyebrow__line" />
            Invitación abierta
          </p>
          <h2>Suma a tu gente al mapa.</h2>
          <p>
            Comparte este código solo con quienes quieras. Cualquier persona con el enlace puede
            entrar al grupo.
          </p>
          <div className="invite-card__actions">
            <Button variant="light" onClick={share}>
              <Icon name="share" size={17} />
              Compartir enlace
            </Button>
            <button
              type="button"
              className="invite-card__code"
              onClick={() => copy(code, 'Código copiado.')}
              title="Copiar código"
            >
              <span>{formatInviteCode(code)}</span>
              <Icon name="copy" size={16} />
            </button>
          </div>
        </div>
        <div className="invite-card__visual" aria-hidden="true">
          <span className="invite-card__orb" />
          <span className="invite-card__ring invite-card__ring--one" />
          <span className="invite-card__ring invite-card__ring--two" />
          <span className="invite-card__stamp">
            <Icon name="globe" size={28} />
            <small>grupo privado</small>
          </span>
        </div>
      </section>

      <section className="group-stats">
        <div>
          <span>Viajeros</span>
          <strong>{formatInteger(overview.members.length)}</strong>
        </div>
        <div>
          <span>Países en común</span>
          <strong>{formatInteger(overview.stats.countries)}</strong>
        </div>
        <div>
          <span>Continentes</span>
          <strong>{formatInteger(overview.stats.continents)}</strong>
        </div>
        <div>
          <span>Kilómetros estimados</span>
          <strong>{formatKm(overview.stats.kilometers)}</strong>
        </div>
      </section>

      <section className="members-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Quiénes viajan</p>
            <h2>La gente de {activeGroup.name}</h2>
          </div>
          <Link className="text-link" to="/mapa?vista=grupo">
            Ver el mapa del grupo <Icon name="arrow-right" size={15} />
          </Link>
        </div>

        <div className="members-grid">
          {overview.members.map((member, index) => {
            const home = getCountry(member.homeCountryCode);
            return (
              <article className="member-card" key={member.id}>
                <div className="member-card__top">
                  <Avatar name={member.name} index={index} size="lg" />
                  <div className="member-card__identity">
                    <h3>
                      {member.name}
                      {member.id === user?.id ? <span className="you-tag">Tú</span> : null}
                    </h3>
                    <p>
                      <CountryFlag code={member.homeCountryCode} size="xs" />{' '}
                      {home?.name ?? member.homeCountryCode}
                    </p>
                  </div>
                  <span className={`role-badge role-badge--${member.role}`}>
                    {member.role === 'owner' ? 'Creador' : 'Miembro'}
                  </span>
                </div>
                <div className="member-card__stats">
                  <div>
                    <strong>{formatInteger(member.stats.countries)}</strong>
                    <span>países</span>
                  </div>
                  <div>
                    <strong>{formatKm(member.stats.kilometers)}</strong>
                    <span>estimados</span>
                  </div>
                  <div>
                    <strong>{formatInteger(member.stats.continents)}</strong>
                    <span>continentes</span>
                  </div>
                  <div>
                    <strong>{formatInteger(member.stats.trips ?? 0)}</strong>
                    <span>viajes</span>
                  </div>
                </div>
                <div className="member-card__bar">
                  <span
                    style={{
                      width: `${Math.max((member.stats.countries / maxCountries) * 100, 3)}%`,
                    }}
                  />
                </div>
                <p className="member-card__joined">
                  En el grupo desde {formatJoinedDate(member.joinedAt)}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="group-privacy">
        <span className="group-privacy__icon">
          <Icon name="lock" size={18} />
        </span>
        <div>
          <strong>Un grupo cerrado, sin redes ni contactos.</strong>
          <p>
            Solo las personas con el código pueden ver el mapa. Los registros de cada viajero son
            suyos; solo se comparan los viajes que cada persona marca como visibles para el grupo.
          </p>
        </div>
      </section>
    </div>
  );
}
