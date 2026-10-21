ALTER TABLE "Vlan"
    ADD COLUMN "ipAddress" TEXT,
    ADD COLUMN "mask" TEXT;

UPDATE "Vlan"
SET
    "ipAddress" = split_part("subnet", '/', 1),
    "mask" = CASE
        WHEN position('/' IN "subnet") > 0 THEN split_part("subnet", '/', 2)
        ELSE NULL
    END
WHERE "subnet" IS NOT NULL;

ALTER TABLE "Vlan" DROP COLUMN "subnet";

ALTER TABLE "PolicyEntry"
    ADD COLUMN "sourceVlanId" TEXT,
    ADD COLUMN "destinationVlanId" TEXT;

CREATE INDEX "PolicyEntry_sourceVlanId_idx" ON "PolicyEntry"("sourceVlanId");
CREATE INDEX "PolicyEntry_destinationVlanId_idx" ON "PolicyEntry"("destinationVlanId");

ALTER TABLE "PolicyEntry"
    ADD CONSTRAINT "PolicyEntry_sourceVlanId_fkey"
    FOREIGN KEY ("sourceVlanId") REFERENCES "Vlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyEntry"
    ADD CONSTRAINT "PolicyEntry_destinationVlanId_fkey"
    FOREIGN KEY ("destinationVlanId") REFERENCES "Vlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
