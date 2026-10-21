CREATE TABLE "Host" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "mask" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Host_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupHost" (
    "groupId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    CONSTRAINT "GroupHost_pkey" PRIMARY KEY ("groupId", "hostId")
);

CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "targetPolicyName" TEXT NOT NULL,
    "destinationIp" TEXT NOT NULL,
    "mask" TEXT NOT NULL,
    "destinationPort" TEXT,
    "protocol" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "internetAccess" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PolicyRulePair" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    CONSTRAINT "PolicyRulePair_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedPolicy" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "switchId" TEXT NOT NULL,
    "switchName" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");
CREATE UNIQUE INDEX "Policy_name_key" ON "Policy"("name");
CREATE INDEX "Host_name_idx" ON "Host"("name");
CREATE UNIQUE INDEX "PolicyRulePair_policyId_groupId_ruleId_key" ON "PolicyRulePair"("policyId", "groupId", "ruleId");
CREATE INDEX "PolicyRulePair_policyId_idx" ON "PolicyRulePair"("policyId");
CREATE INDEX "GeneratedPolicy_policyId_createdAt_idx" ON "GeneratedPolicy"("policyId", "createdAt");

ALTER TABLE "GroupHost" ADD CONSTRAINT "GroupHost_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupHost" ADD CONSTRAINT "GroupHost_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PolicyRulePair" ADD CONSTRAINT "PolicyRulePair_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PolicyRulePair" ADD CONSTRAINT "PolicyRulePair_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PolicyRulePair" ADD CONSTRAINT "PolicyRulePair_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneratedPolicy" ADD CONSTRAINT "GeneratedPolicy_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
