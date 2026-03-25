import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "admincoop_session";
const PORTAL_SESSION_COOKIE = "admincoop_portal_session";
const SESSION_MAX_AGE = 60 * 60 * 10;

type SessionPayload = {
  userId: number;
  role: string;
  exp: number;
};

type PortalSessionPayload = {
  abonadoId: number;
  exp: number;
};

type ExpirablePayload = {
  exp: number;
};

function getAuthSecret() {
  return process.env.AUTH_SECRET || "dev-secret-change-me";
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
}

export function createSessionToken(payload: ExpirablePayload) {
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken<T extends ExpirablePayload = SessionPayload>(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = signPayload(encodedPayload);
  if (expected !== signature) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as T;
    if (!payload.exp || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function createSession(userId: number, role: string) {
  const cookieStore = await cookies();
  const payload: SessionPayload = {
    userId,
    role,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  };

  cookieStore.set(SESSION_COOKIE, createSessionToken(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function createPortalSession(abonadoId: number) {
  const cookieStore = await cookies();
  const payload: PortalSessionPayload = {
    abonadoId,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  };

  cookieStore.set(PORTAL_SESSION_COOKIE, createSessionToken(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearPortalSession() {
  const cookieStore = await cookies();
  cookieStore.delete(PORTAL_SESSION_COOKIE);
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  const user = await prisma.usuario.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      nombre: true,
      email: true,
      rol: true,
      activo: true,
      lastLoginAt: true,
    },
  });

  if (!user || !user.activo) {
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  return user;
}

export async function getCurrentPortalSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const payload = verifySessionToken<PortalSessionPayload>(token);
  if (!payload) {
    cookieStore.delete(PORTAL_SESSION_COOKIE);
    return null;
  }

  const abonado = await prisma.abonado.findUnique({
    where: { id: payload.abonadoId },
    select: {
      id: true,
      numeroAbonado: true,
      nombre: true,
      apellido: true,
      razonSocial: true,
      email: true,
      telefono: true,
      portalActivo: true,
      portalUltimoAccesoAt: true,
    },
  });

  if (!abonado || !abonado.portalActivo) {
    cookieStore.delete(PORTAL_SESSION_COOKIE);
    return null;
  }

  return abonado;
}

export async function requireUser() {
  const user = await getCurrentSession();
  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRole(roles: string[]) {
  const user = await requireUser();
  if (!roles.includes(user.rol)) {
    redirect("/?error=No+tenes+permisos+para+esta+accion.");
  }

  return user;
}

export async function requirePortalSession() {
  const abonado = await getCurrentPortalSession();
  if (!abonado) {
    redirect("/portal-cliente/login");
  }

  return abonado;
}

export function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname === "/portal-cliente/login";
}
