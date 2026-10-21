ALTER TABLE "PolicyEntry"
    DROP CONSTRAINT "PolicyEntry_one_source_check",
    DROP CONSTRAINT "PolicyEntry_one_destination_check";

ALTER TABLE "PolicyEntry"
    ADD CONSTRAINT "PolicyEntry_one_source_check"
        CHECK (num_nonnulls("sourceHostId", "sourceGroupId", "sourceVlanId") = 1),
    ADD CONSTRAINT "PolicyEntry_one_destination_check"
        CHECK (num_nonnulls("destinationHostId", "destinationGroupId", "destinationVlanId") = 1);
