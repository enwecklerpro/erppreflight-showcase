# Code excerpts

Short, read-only excerpts from the private ERP Preflight repository. They show how the platform is
built — contracts, isolation, testing hooks — not the analysis rules themselves. The files are not
meant to compile on their own.

| File | Shows |
|---|---|
| [`evidence.schema.ts`](evidence.schema.ts) | Shared zod contract for the evidence behind every finding (path, line/column or XPath/JSON pointer, SHA-256, provenance, release alignment) |
| [`base_engine.py`](base_engine.py) | Base class of all 19 engines: declared rule inventory and input contract, rule versioning by content digest, health checks, adversarial contract probes |
| [`tenant-rls.sql`](tenant-rls.sql) | Tenant isolation with PostgreSQL row-level security (`ENABLE` + `FORCE`, policy per table) |
| [`with-tenant-transaction.ts`](with-tenant-transaction.ts) | How the API scopes each transaction to one tenant so the RLS policies apply |
