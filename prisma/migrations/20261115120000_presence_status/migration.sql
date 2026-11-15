-- CreateEnum
CREATE TYPE "PresenceStatus" AS ENUM ('available', 'busy', 'on_call');

-- AlterTable
ALTER TABLE "Presence" ADD COLUMN "status" "PresenceStatus" NOT NULL DEFAULT 'available';
ALTER TABLE "Presence" ADD COLUMN "peerId" TEXT;

UPDATE "Presence" SET "status" = CASE WHEN "busy" = true THEN 'busy'::"PresenceStatus" ELSE 'available'::"PresenceStatus" END;

ALTER TABLE "Presence" DROP COLUMN "busy";

-- CreateIndex
CREATE INDEX "Presence_peerId_idx" ON "Presence"("peerId");