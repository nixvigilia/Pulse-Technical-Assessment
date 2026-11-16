-- Session auth: required for all join/poll/match API routes (authorize-presence).
ALTER TABLE "Presence" ADD COLUMN "secretHash" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Presence" ALTER COLUMN "secretHash" DROP DEFAULT;