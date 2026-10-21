ALTER TABLE "PolicyRulePair" DROP CONSTRAINT "PolicyRulePair_groupId_fkey";
ALTER TABLE "PolicyRulePair" ADD CONSTRAINT "PolicyRulePair_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyRulePair" DROP CONSTRAINT "PolicyRulePair_ruleId_fkey";
ALTER TABLE "PolicyRulePair" ADD CONSTRAINT "PolicyRulePair_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
