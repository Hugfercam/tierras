import { Icon } from './Icons';

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="infotip" tabIndex={0} role="note" aria-label={text}>
      <Icon name="info" size={14} />
      <span className="infotip__bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}
