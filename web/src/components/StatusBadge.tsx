import { cn, STATUS_COLORS } from '../lib/utils';

interface Props {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: Props) {
  return (
    <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide', STATUS_COLORS[status] || 'bg-slate-500/20 text-slate-400', className)}>
      {status}
    </span>
  );
}
