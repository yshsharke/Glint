import { iconName } from '../icons';

export function Icon({ name }: { name: string }) {
  return <span className={'icon lucide-' + iconName(name)} aria-hidden="true" />;
}

export function Brand() {
  return <span className="icon glint-mark" aria-hidden="true" />;
}
