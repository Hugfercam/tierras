import { getCountry } from '../../../shared/countries.ts';
import { cn } from '../../lib/cn';

interface CountryFlagProps {
  code: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero';
  className?: string;
}

export function CountryFlag({ code, size = 'sm', className }: CountryFlagProps) {
  const country = getCountry(code);
  if (!country) {
    return (
      <span className={cn('country-flag-fallback', className)} aria-hidden="true">
        {code}
      </span>
    );
  }
  return (
    <span
      className={cn('country-flag', `country-flag--${size}`, className)}
      style={{ backgroundImage: `url(/flags/${country.iso2.toLowerCase()}.svg)` }}
      title={country.name}
      aria-hidden="true"
    />
  );
}
