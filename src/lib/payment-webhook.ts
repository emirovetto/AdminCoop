export function normalizeExternalPaymentState(rawStatus?: string | null) {
  const status = String(rawStatus ?? "").toLowerCase();

  if (["approved", "accredited", "paid", "success", "authorized"].includes(status)) {
    return "ACREDITADO";
  }

  if (["rejected", "cancelled", "canceled", "failed", "denied"].includes(status)) {
    return "RECHAZADO";
  }

  if (["expired"].includes(status)) {
    return "EXPIRADO";
  }

  if (["pending", "in_process", "processing"].includes(status)) {
    return "EN_PROCESO";
  }

  return null;
}

export function extractInternalReference(payload: Record<string, unknown>) {
  const direct =
    payload.referenciaInterna ||
    payload.referencia ||
    payload.reference ||
    payload.external_reference;

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const data = payload.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const nested = (data as Record<string, unknown>).external_reference;
    if (typeof nested === "string" && nested.trim()) {
      return nested.trim();
    }
  }

  return null;
}

export function extractExternalReference(payload: Record<string, unknown>) {
  const direct = payload.id ?? payload.payment_id;
  if (typeof direct === "string" || typeof direct === "number") {
    return String(direct);
  }

  const data = payload.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const nested = (data as Record<string, unknown>).id;
    if (typeof nested === "string" || typeof nested === "number") {
      return String(nested);
    }
  }

  return null;
}

export function extractExternalStatus(payload: Record<string, unknown>) {
  const direct = payload.status;
  if (typeof direct === "string") {
    return direct;
  }

  const data = payload.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const nested = (data as Record<string, unknown>).status;
    if (typeof nested === "string") {
      return nested;
    }
  }

  return null;
}
