import { cn } from '../../lib/cn';
import { initials } from '../../lib/format';
import { memberColor } from '../../lib/colors';

interface AvatarProps {
  name: string;
  index?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  dimmed?: boolean;
}

export function Avatar({ name, index = 0, size = 'md', className, dimmed = false }: AvatarProps) {
  const color = memberColor(index);
  return (
    <span
      className={cn('avatar', `avatar--${size}`, dimmed && 'is-dimmed', className)}
      style={{ backgroundColor: color }}
      title={name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}
