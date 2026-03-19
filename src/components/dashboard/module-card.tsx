import Link from "next/link";

type ModuleCardProps = {
  title: string;
  description: string;
  href: string;
  footer: string;
  badge?: string;
};

export function ModuleCard({ title, description, href, footer, badge }: ModuleCardProps) {
  return (
    <article className="card module-card">
      <div>
        {badge ? <span className="module-card__badge">{badge}</span> : null}
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="module-card__footer">
        <span>{footer}</span>
        <Link href={href}>Abrir modulo</Link>
      </div>
    </article>
  );
}
