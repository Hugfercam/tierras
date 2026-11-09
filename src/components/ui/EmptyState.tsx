import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('empty-state', compact && 'empty-state--compact', className)}>
      {icon ? <div className="empty-state__icon">{icon}</div> : null}
      <h3 className="empty-state__title">{title}</h3>
      {description ? <p className="empty-state__text">{description}</p> : null}
      {actions ? <div className="empty-state__actions">{actions}</div> : null}
    </div>
  );
}
