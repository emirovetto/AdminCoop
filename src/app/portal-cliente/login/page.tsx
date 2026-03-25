import { portalLoginAction } from "@/app/actions";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { SubmitButton } from "@/components/shared/submit-button";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getQueryValue(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  return typeof params?.[key] === "string" ? String(params[key]).trim() : "";
}

export default async function PortalLoginPage({ searchParams }: PageProps) {
  const params = searchParams ? await searchParams : undefined;
  const ok = getQueryValue(params, "ok");
  const error = getQueryValue(params, "error");

  return (
    <section className="login-shell">
      <article className="login-card">
        <span className="eyebrow">Oficina virtual</span>
        <h1>Portal del abonado</h1>
        <p>
          Consulta avisos, comprobantes, tickets y movimientos de tu cuenta en un entorno
          simple, directo y listo para operar.
        </p>

        <FeedbackBanner message={ok} tone="success" />
        <FeedbackBanner message={error} tone="error" />

        <form action={portalLoginAction} className="form-panel form-panel--login">
          <label className="field">
            <span>Numero de abonado</span>
            <input name="numeroAbonado" placeholder="Ej. 0001 o AB-1001" required type="text" />
          </label>
          <label className="field">
            <span>Contrasena</span>
            <input name="password" placeholder="Tu contrasena del portal" required type="password" />
          </label>
          <div className="form-actions">
            <SubmitButton idleLabel="Ingresar al portal" pendingLabel="Ingresando..." />
          </div>
        </form>
      </article>
    </section>
  );
}
