# Security Policy

## Reporting a vulnerability

Please do not initially report a sensitive vulnerability as an ordinary public
GitHub Issue.

Use the repository's
[private vulnerability reporting form](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/security/advisories/new)
when it is available. Include the affected version, potential impact, minimal
reproduction details, and any suggested mitigation. Remove credentials, tokens,
private connection strings, and sensitive production data.

If GitHub private vulnerability reporting is unavailable, open a
[public issue](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/issues)
containing no vulnerability details and ask the maintainers to provide a private
reporting path. Do not include exploit steps, secrets, private infrastructure, or
other sensitive information in that issue.

Security fixes are assessed for the currently maintained release line. Public
disclosure should wait until the maintainers have had a reasonable opportunity to
investigate and coordinate a fix.

## Product security boundaries

- Query Puppy does not request or store its own SQL credentials. It reuses the
  active connection owned by Microsoft `mssql`.
- Schema discovery is read-only and does not provision or modify database objects
  or application data.
- Persistent snapshots contain allow-listed schema metadata, not credentials,
  tokens, query text, or document-local SQL state.

These boundaries do not remove the need to redact reports. Logs, schema names, and
SQL examples can still contain confidential information.
