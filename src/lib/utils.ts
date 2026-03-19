export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function getCurrentBillingPeriodLabel(date = new Date()) {
  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function getMonthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  return { start, end };
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getDaysOverdue(value: string) {
  const dueDate = new Date(value);
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = Math.floor((now.getTime() - dueDate.getTime()) / msPerDay);
  return diff > 0 ? diff : 0;
}

export function formatDecimal(value: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function toCsvValue(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/"/g, '""')
    .replace(/\r?\n/g, " ");

  return `"${normalized}"`;
}

export function buildCsv(headers: string[], rows: Array<Array<unknown>>) {
  return [headers.map(toCsvValue).join(","), ...rows.map((row) => row.map(toCsvValue).join(","))].join(
    "\n",
  );
}
