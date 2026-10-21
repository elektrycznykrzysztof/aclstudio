CREATE TABLE "Vlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" INTEGER NOT NULL,
    "subnet" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vlan_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Vlan" ("id", "name", "tag")
VALUES ('legacy-default-vlan', 'Default VLAN', 1);

ALTER TABLE "Host" ADD COLUMN "vlanId" TEXT;
ALTER TABLE "Group" ADD COLUMN "vlanId" TEXT;
ALTER TABLE "Policy" ADD COLUMN "vlanId" TEXT;

UPDATE "Host" SET "vlanId" = 'legacy-default-vlan';
UPDATE "Group" SET "vlanId" = 'legacy-default-vlan';
UPDATE "Policy" SET "vlanId" = 'legacy-default-vlan';

ALTER TABLE "Host" ALTER COLUMN "vlanId" SET NOT NULL;
ALTER TABLE "Group" ALTER COLUMN "vlanId" SET NOT NULL;
ALTER TABLE "Policy" ALTER COLUMN "vlanId" SET NOT NULL;

CREATE UNIQUE INDEX "Vlan_name_key" ON "Vlan"("name");
CREATE UNIQUE INDEX "Vlan_tag_key" ON "Vlan"("tag");
CREATE INDEX "Host_vlanId_idx" ON "Host"("vlanId");
CREATE INDEX "Group_vlanId_idx" ON "Group"("vlanId");
CREATE INDEX "Policy_vlanId_idx" ON "Policy"("vlanId");

ALTER TABLE "Host" ADD CONSTRAINT "Host_vlanId_fkey"
    FOREIGN KEY ("vlanId") REFERENCES "Vlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Group" ADD CONSTRAINT "Group_vlanId_fkey"
    FOREIGN KEY ("vlanId") REFERENCES "Vlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_vlanId_fkey"
    FOREIGN KEY ("vlanId") REFERENCES "Vlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
