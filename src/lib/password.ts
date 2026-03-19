import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, originalHash] = storedHash.split(":");
  if (!salt || !originalHash) {
    return false;
  }

  const derivedHash = scryptSync(password, salt, 64);
  const originalBuffer = Buffer.from(originalHash, "hex");

  if (derivedHash.length !== originalBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedHash, originalBuffer);
}
