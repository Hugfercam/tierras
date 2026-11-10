import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, joinGroup } from '../lib/api';
import { extractInviteCode, formatInviteCode } from '../lib/invite';
import { useGroup } from '../contexts/GroupContext';
import { useToast } from '../contexts/ToastContext';
import { useOnlineStatus } from '../hooks/useUi';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icons';
import { PageError, PageLoader } from '../components/ui/PageState';

export function InvitePage() {
  const { code: rawCode = '' } = useParams();
  const code = useMemo(() => extractInviteCode(rawCode), [rawCode]);
  const {
    groups,
    groupsLoading,
    groupsError,
    setActiveGroupId,
    addGroupLocally,
    refreshGroups,
  } = useGroup();
  const { toast } = useToast();
  const online = useOnlineStatus();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (groupsLoading) return <PageLoader label="Leyendo tu invitación…" />;
  if (groupsError) {
    return (
      <PageError
        title="No pudimos leer la invitación."
        description="Revisa tu conexión y vuelve a intentarlo."
      />
    );
  }

  const existing = groups.find((group) => group.inviteCode === code);

  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      const result = await joinGroup(code);
      addGroupLocally(result.group);
      setActiveGroupId(result.group.id);
      await refreshGroups();
      toast(`Ya eres parte de “${result.group.name}”.`, 'success');
      navigate('/grupo');
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === 'ALREADY_MEMBER') {
          await refreshGroups();
          toast('Ya formas parte de este grupo.', 'info');
          navigate('/grupo');
          return;
        }
        setError(caught.message);
      } else {
        setError('No pudimos unirte al grupo. Intenta de nuevo.');
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="standalone-page invite-page">
      <section className="invite-accept">
        <div className="invite-accept__visual" aria-hidden="true">
          <span className="invite-accept__ring invite-accept__ring--one" />
          <span className="invite-accept__ring invite-accept__ring--two" />
          <span className="invite-accept__globe">
            <Icon name="globe" size={64} />
          </span>
          <span className="invite-accept__pin" />
        </div>
        <p className="eyebrow">
          <span className="eyebrow__line" />
          Te invitaron a un mapa
        </p>
        <h1>
          Un grupo nuevo, <em>un mundo por marcar.</em>
        </h1>
        <p className="invite-accept__lede">
          {existing
            ? `Ya eres parte de ${existing.name}. Puedes abrir el mapa o ver a tu gente.`
            : 'Al entrar vas a poder ver todos los países del grupo y sumar los tuyos. Solo se accede con este código.'}
        </p>
        <div className="invite-accept__code">
          <span>Código de invitación</span>
          <strong>{formatInviteCode(code)}</strong>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            <Icon name="info" size={16} />
            {error}
          </p>
        ) : null}

        <div className="invite-accept__actions">
          {existing ? (
            <>
              <Button
                size="lg"
                onClick={() => {
                  setActiveGroupId(existing.id);
                  navigate('/mapa');
                }}
              >
                <Icon name="map" size={18} />
                Abrir el mapa
              </Button>
              <Link className="btn btn--ghost btn--lg" to="/grupo">
                Ver el grupo
              </Link>
            </>
          ) : (
            <>
              <Button
                size="lg"
                onClick={handleJoin}
                loading={joining}
                disabled={!online || code.length < 4}
              >
                <Icon name="users" size={18} />
                Unirme al grupo
              </Button>
              <Link className="btn btn--ghost btn--lg" to="/mapa">
                Ahora no
              </Link>
            </>
          )}
        </div>
        {!online && !existing ? (
          <p className="form-note form-note--warn">
            Sin conexión. Para unirte a un grupo necesitas estar online.
          </p>
        ) : null}
      </section>
    </div>
  );
}
