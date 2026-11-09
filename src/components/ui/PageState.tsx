import { Button, Spinner } from './Button';
import { Icon } from './Icons';

export function PageLoader({ label = 'Cargando el mapa…' }: { label?: string }) {
  return (
    <div className="page-state">
      <div className="page-state__spinner">
        <Spinner size={30} />
      </div>
      <p>{label}</p>
    </div>
  );
}

export function PageError({
  title = 'No pudimos cargar esto.',
  description = 'Revisá tu conexión e intentá de nuevo.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="page-state page-state--error">
      <div className="page-state__icon">
        <Icon name="cloud-off" size={30} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
