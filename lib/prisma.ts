import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 connects through a driver adapter. We pass the (pooled) Postgres
// connection string to the pg adapter.
//
// Reuse a single PrismaClient across hot reloads (dev) and warm serverless
// invocations to avoid exhausting Postgres connections. Use a *pooled*
// connection string for DATABASE_URL in production (PgBouncer / Neon pooler).
/** Bump when Presence fields in `prisma/schema.prisma` change (after `prisma generate`). */
const PRESENCE_CLIENT_GEN = 3;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  presenceClientGen?: number;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

function getPrismaClient(): PrismaClient {
  if (
    process.env.NODE_ENV !== "production" &&
    globalForPrisma.presenceClientGen !== PRESENCE_CLIENT_GEN &&
    globalForPrisma.prisma
  ) {
    void globalForPrisma.prisma.$disconnect();
    globalForPrisma.prisma = undefined;
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.presenceClientGen = PRESENCE_CLIENT_GEN;
    }
  }

  return globalForPrisma.prisma;
}

export const prisma = getPrismaClient();
