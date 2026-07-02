interface Props {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  sub?: string;
  color?: string;
}

export function StatCard({ title, value, icon, sub, color = 'text-primary' }: Props) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-slate-800 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-textMuted text-sm">{title}</p>
        <p className="text-3xl font-extrabold text-text md:text-4xl tracking-tight">{value}</p>
        {sub && <p className="text-xs text-textMuted mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
