# Support

Use the repository's [bug report form](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/issues/new?template=bug_report.yml) for reproducible defects and the [feature request form](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/issues/new?template=feature_request.yml) for proposed improvements.

Support is provided on a best-effort basis through these public project channels. There is no SLA or guaranteed response time, but reproducible reports and community participation are welcome.

Do not report a sensitive vulnerability as an ordinary public issue. Follow the private reporting guidance in [SECURITY.md](SECURITY.md).

## Bug reports

When opening an issue, include:

- Query Puppy for T-SQL and VS Code/VSCodium versions
- Microsoft SQL Server (`ms-mssql.mssql`) version
- Whether **Query Puppy for T-SQL: Show Status** reports mssql as available and connected
- The active database and cache state shown by **Query Puppy for T-SQL: Show Status**, without credentials or a full connection string
- Whether the problem remains after **Query Puppy for T-SQL: Refresh Schema Metadata** completes
- Relevant lines from **Output: Query Puppy for T-SQL** after enabling `queryPuppyForTSql.debugLogging`
- Minimal SQL that reproduces the completion context, with confidential names replaced if necessary

Never include passwords, tokens, complete connection strings, or sensitive query/data values in an issue. Replace confidential identifiers and values in reproduction SQL where necessary.

## Feature requests

Describe the editing problem, the proposed behavior, and a realistic anonymized SQL example where applicable. Explain whether VS Code, VSCodium, or Microsoft `mssql` already offers something similar and how Query Puppy's semantic model could add distinct value.
