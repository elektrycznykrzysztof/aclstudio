ALTER TABLE "Policy" ADD COLUMN "reflectivePolicyName" TEXT;

CREATE TABLE "PolicyEntry" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "sourceHostId" TEXT,
    "sourceGroupId" TEXT,
    "destinationHostId" TEXT,
    "destinationGroupId" TEXT,
    "protocol" TEXT,
    "destinationPort" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PolicyEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PolicyEntry_one_source_check"
      CHECK (num_nonnulls("sourceHostId", "sourceGroupId") = 1),
    CONSTRAINT "PolicyEntry_one_destination_check"
      CHECK (num_nonnulls("destinationHostId", "destinationGroupId") = 1)
);

INSERT INTO "Host" ("id", "name", "description", "ipAddress", "mask", "createdAt")
SELECT
    'legacy-destination-' || md5(destination."destinationIp" || '/' || destination."mask"),
    'legacy-destination-' || substr(md5(destination."destinationIp" || '/' || destination."mask"), 1, 12),
    'Migrated destination from the former ruleset',
    destination."destinationIp",
    destination."mask",
    CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "destinationIp", "mask"
    FROM "Rule"
) AS destination
WHERE NOT EXISTS (
    SELECT 1
    FROM "Host" AS existing
    WHERE existing."ipAddress" = destination."destinationIp"
      AND existing."mask" = destination."mask"
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "PolicyEntry" (
    "id",
    "policyId",
    "position",
    "sourceGroupId",
    "destinationHostId",
    "protocol",
    "destinationPort"
)
SELECT
    'legacy-entry-' || pair."id",
    pair."policyId",
    (ROW_NUMBER() OVER (PARTITION BY pair."policyId" ORDER BY pair."id") - 1)::INTEGER,
    pair."groupId",
    (
      SELECT host."id"
      FROM "Host" AS host
      WHERE host."ipAddress" = rule."destinationIp"
        AND host."mask" = rule."mask"
      ORDER BY host."createdAt", host."id"
      LIMIT 1
    ),
    rule."protocol",
    rule."destinationPort"
FROM "PolicyRulePair" AS pair
JOIN "Rule" AS rule ON rule."id" = pair."ruleId";

CREATE INDEX "PolicyEntry_policyId_position_idx" ON "PolicyEntry"("policyId", "position");

ALTER TABLE "PolicyEntry" ADD CONSTRAINT "PolicyEntry_policyId_fkey"
  FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PolicyEntry" ADD CONSTRAINT "PolicyEntry_sourceHostId_fkey"
  FOREIGN KEY ("sourceHostId") REFERENCES "Host"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PolicyEntry" ADD CONSTRAINT "PolicyEntry_sourceGroupId_fkey"
  FOREIGN KEY ("sourceGroupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PolicyEntry" ADD CONSTRAINT "PolicyEntry_destinationHostId_fkey"
  FOREIGN KEY ("destinationHostId") REFERENCES "Host"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PolicyEntry" ADD CONSTRAINT "PolicyEntry_destinationGroupId_fkey"
  FOREIGN KEY ("destinationGroupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "PolicyRulePair";
DROP TABLE "Rule";
ALTER TABLE "Policy" DROP COLUMN "internetAccess";
