type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "accent" | "warning";
};

export function StatCard({ label, value, detail, tone = "default" }: StatCardProps) {
  return (
    <article className={`card stat-card stat-card--${tone}`}>
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
      <p className="stat-card__detail">{detail}</p>
    </article>
  );
}
