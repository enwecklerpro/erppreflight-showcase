-- Excerpt from packages/database/migrations/001_initial_schema.sql (shortened).
-- Tenant isolation is enforced by PostgreSQL itself, not only by application code:
-- every tenant-owned table has ENABLE + FORCE ROW LEVEL SECURITY and a policy that compares
-- organization_id with the tenant id set for the current transaction. The API connects with a
-- non-superuser role without BYPASSRLS, so a missing WHERE clause cannot leak another tenant's rows.

-- Tenant id of the current transaction (set by the API, see with-tenant-transaction.ts).
CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_tenant_id', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Same pattern for every tenant-owned table (projects, uploaded_files, analyses, findings, evidence, ...).
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_findings ON findings;
CREATE POLICY tenant_isolation_findings ON findings
    FOR ALL
    USING (organization_id = get_current_tenant_id())
    WITH CHECK (organization_id = get_current_tenant_id());

ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_evidence ON evidence;
CREATE POLICY tenant_isolation_evidence ON evidence
    FOR ALL
    USING (organization_id = get_current_tenant_id())
    WITH CHECK (organization_id = get_current_tenant_id());
