import { useGroup } from '../../contexts/GroupContext';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icons';

export function NoGroupState({ compact = false }: { compact?: boolean }) {
  const { openCreateGroup, openJoinGroup } = useGroup();

  return (
    <section className={compact ? 'no-group no-group--compact' : 'no-group'}>
      <div className="no-group__orb" aria-hidden="true">
        <span className="no-group__ring no-group__ring--one" />
        <span className="no-group__ring no-group__ring--two" />
        <span className="no-group__globe">
          <Icon name="globe" size={54} />
        </span>
        <span className="no-group__pin" />
      </div>
      <p className="eyebrow">
        <span className="eyebrow__line" />
        El primer viaje es armar el grupo
      </p>
      <h1>
        Tu mapa empieza <em>con tu gente.</em>
      </h1>
      <p className="no-group__lede">
        Crea un grupo privado o únete con un código. Después cada persona marca sus países y el
        recorrido se vuelve compartido.
      </p>
      <div className="no-group__actions">
        <Button size="lg" onClick={openCreateGroup}>
          <Icon name="plus" size={18} />
          Crear mi grupo
        </Button>
        <Button size="lg" variant="secondary" onClick={openJoinGroup}>
          <Icon name="link" size={18} />
          Tengo un código
        </Button>
      </div>
      <div className="no-group__notes">
        <span>
          <Icon name="lock" size={14} /> Solo entra quien tiene el código
        </span>
        <span>
          <Icon name="users" size={14} /> Amigos, familia o quien tú elijas
        </span>
      </div>
    </section>
  );
}
