// Excerpt from packages/database/src/client.ts (one method of the database client class).
// Every tenant-scoped query runs inside a transaction that first sets app.current_tenant_id.
// `set_config(..., true)` is transaction-local, so the tenant id cannot leak to the next request
// that reuses the pooled connection. The row-level security policies (tenant-rls.sql) read it.

  /**
   * Executes a callback within a dedicated PostgreSQL client transaction
   * scoped with `app.current_tenant_id` for Row-Level Security.
   *
   * Supports two signatures:
   * 1. withTenantTransaction(tenantId, callback)
   * 2. withTenantTransaction(callback) -> retrieves tenantId from TenancyContext
   */
  async withTenantTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T>;
  async withTenantTransaction<T>(
    tenantId: string,
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T>;
  async withTenantTransaction<T>(
    tenantIdOrCallback: string | ((client: PoolClient) => Promise<T>),
    maybeCallback?: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const tenantId =
      typeof tenantIdOrCallback === 'string'
        ? tenantIdOrCallback
        : TenancyContext.getTenantId();

    const callback =
      typeof tenantIdOrCallback === 'function'
        ? tenantIdOrCallback
        : maybeCallback;

    if (!callback) {
      throw new Error('withTenantTransaction: Missing required callback function');
    }
    if (!tenantId) {
      throw new Error('withTenantTransaction: tenantId is required or TenancyContext must be active');
    }

    const client = await this.pool.connect();
    let isBroken = false;

    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // Mark connection broken so it will be evicted from pool
        isBroken = true;
      }
      throw error;
    } finally {
      if (isBroken) {
        client.release(true); // Evict destroyed/broken connection
      } else {
        client.release();
      }
    }
  }
