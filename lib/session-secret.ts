import { createHash, timingSafeEqual } from "node:crypto";

export function hashSessionSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function isValidSessionSecret(secret: unknown): secret is string {
  return (
    typeof secret === "string" &&
    secret.length >= 16 &&
    secret.length <= 256
  );
}

export function verifySessionSecret(secret: string, storedHash: string): boolean {
  if (!isValidSessionSecret(secret) || typeof storedHash !== "string") {
    return false;
  }
  const digest = hashSessionSecret(secret);
  if (digest.length !== storedHash.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(digest, "utf8"),
      Buffer.from(storedHash, "utf8"),
    );
  } catch {
    return false;
  }
}