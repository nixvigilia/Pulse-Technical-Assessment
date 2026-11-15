import { prisma } from "@/lib/prisma";
import {
  isValidSessionSecret,
  verifySessionSecret,
} from "@/lib/session-secret";

export async function authorizePresence(
  id: string,
  secret: unknown,
): Promise<boolean> {
  if (typeof id !== "string" || !id || !isValidSessionSecret(secret)) {
    return false;
  }
  const row = await prisma.presence.findUnique({
    where: { id },
    select: { secretHash: true },
  });
  if (!row) return false;
  return verifySessionSecret(secret, row.secretHash);
}