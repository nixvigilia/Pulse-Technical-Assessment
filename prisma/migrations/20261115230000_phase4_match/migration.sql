-- AlterEnum
ALTER TYPE "PresenceStatus" ADD VALUE 'searching';
ALTER TYPE "PresenceStatus" ADD VALUE 'pending_accept';

-- AlterTable
ALTER TABLE "Presence" ADD COLUMN "spokenLanguages" TEXT;
ALTER TABLE "Presence" ADD COLUMN "preferredLanguage" TEXT;
ALTER TABLE "Presence" ADD COLUMN "gender" TEXT;
ALTER TABLE "Presence" ADD COLUMN "matchLanguage" TEXT;
ALTER TABLE "Presence" ADD COLUMN "matchGenderPref" TEXT;
ALTER TABLE "Presence" ADD COLUMN "matchMode" TEXT;
ALTER TABLE "Presence" ADD COLUMN "matchId" TEXT;
ALTER TABLE "Presence" ADD COLUMN "matchPartnerId" TEXT;
ALTER TABLE "Presence" ADD COLUMN "matchExpiresAt" TIMESTAMP(3);
ALTER TABLE "Presence" ADD COLUMN "matchAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Presence" ADD COLUMN "matchCooldownUntil" TIMESTAMP(3);

CREATE INDEX "Presence_matchId_idx" ON "Presence"("matchId");
CREATE INDEX "Presence_status_idx" ON "Presence"("status");