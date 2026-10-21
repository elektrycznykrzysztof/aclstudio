ALTER TABLE "Rule" ADD COLUMN "name" TEXT;

UPDATE "Rule" SET "name" = "targetPolicyName";

ALTER TABLE "Rule" ALTER COLUMN "name" SET NOT NULL;
