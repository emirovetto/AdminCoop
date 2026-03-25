import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { SubmitButton } from "@/components/shared/submit-button";
import { getCurrentSessionSafe } from "@/lib/auth";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const { session, databaseUnavailable } = await getCurrentSessionSafe();
  if (session) {
    redirect("/");
  }

  const params = searchParams ? await searchParams : undefined;
  const error = typeof params?.error === "string" ? params.error : undefined;
  const systemMessage = databaseUnavailable
    ? "La base operativa no esta disponible en este momento. El acceso interno quedo temporalmente en modo contingencia."
    : undefined;

  return (
    <section className="login-shell">
      <div className="login-layout">
        <article className="login-stage">
          <span className="eyebrow">Suite cooperativa</span>
          <h1>Gestion integrada para operacion, facturacion y terreno.</h1>
          <p>
            Un entorno unico para administrar abonados, cobranzas, ordenes tecnicas, stock,
            reclamos y control fiscal sin perder contexto.
          </p>
          <div className="login-highlights">
            <div>
              <strong>Cobranza y cuenta corriente</strong>
              <span>Promesas, acuerdos, recibos, cierres diarios y alertas de recupero.</span>
            </div>
            <div>
              <strong>Operacion tecnica</strong>
              <span>Reclamos, instalaciones, mantenimiento y materiales vinculados a facturacion.</span>
            </div>
            <div>
              <strong>Control ejecutivo</strong>
              <span>Reportes, trazabilidad, auditoria y monitoreo cruzado de prioridades.</span>
            </div>
            <div>
              <strong>Base centralizada</strong>
              <span>Todo sincronizado con MySQL y preparado para ARCA y crecimiento del sistema.</span>
            </div>
          </div>
        </article>

        <article className="login-card">
          <span className="eyebrow">Acceso interno</span>
          <h1>Admin Coop</h1>
          <p>
            Inicia sesion para entrar al tablero principal y continuar la operacion del dia.
          </p>
          <FeedbackBanner message={systemMessage} tone="error" />
          <FeedbackBanner message={error} tone="error" />
          <form action={loginAction} className="form-panel form-panel--login">
            <fieldset disabled={databaseUnavailable}>
              <label className="field">
                <span>Email</span>
                <input name="email" placeholder="lucia@coop.local" required type="email" />
              </label>
              <label className="field">
                <span>Contrasena</span>
                <input name="password" placeholder="Tu contrasena" required type="password" />
              </label>
              <div className="form-actions">
                <SubmitButton idleLabel="Ingresar al panel" pendingLabel="Ingresando..." />
              </div>
            </fieldset>
          </form>
          <div className="login-note">
            <strong>Acceso restringido</strong>
            <span>
              {databaseUnavailable
                ? "El formulario queda bloqueado hasta recuperar la conexion con la base de datos."
                : "Solo para personal autorizado de la cooperativa."}
            </span>
          </div>
        </article>
      </div>
    </section>
  );
}
