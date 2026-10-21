ALTER TABLE "Policy"
ADD COLUMN "needsGeneration" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "PolicyEntry"
ADD COLUMN "sourcePort" TEXT,
ADD COLUMN "reflectiveOfEntryId" TEXT;

CREATE UNIQUE INDEX "PolicyEntry_reflectiveOfEntryId_key"
ON "PolicyEntry"("reflectiveOfEntryId");

ALTER TABLE "PolicyEntry"
ADD CONSTRAINT "PolicyEntry_reflectiveOfEntryId_fkey"
FOREIGN KEY ("reflectiveOfEntryId") REFERENCES "PolicyEntry"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PolicyLink" (
  "sourcePolicyId" TEXT NOT NULL,
  "targetPolicyId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "needsGeneration" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "PolicyLink_pkey" PRIMARY KEY ("sourcePolicyId", "targetPolicyId"),
  CONSTRAINT "PolicyLink_sourcePolicyId_fkey" FOREIGN KEY ("sourcePolicyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PolicyLink_targetPolicyId_fkey" FOREIGN KEY ("targetPolicyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PolicyLink_targetPolicyId_needsGeneration_idx"
ON "PolicyLink"("targetPolicyId", "needsGeneration");
