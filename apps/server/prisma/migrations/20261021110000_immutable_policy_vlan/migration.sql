CREATE FUNCTION prevent_policy_vlan_change() RETURNS trigger AS $$
BEGIN
  IF NEW."vlanId" IS DISTINCT FROM OLD."vlanId" THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'A policy VLAN cannot be changed while the policy exists.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Policy_vlan_immutable"
BEFORE UPDATE OF "vlanId" ON "Policy"
FOR EACH ROW
EXECUTE FUNCTION prevent_policy_vlan_change();
