# Support

Query Puppy for T-SQL is a free and open-source project.

Query Puppy is currently **pre-1.0 and under active development**. It is already useful for substantial day-to-day T-SQL work, but users should expect occasional rough edges, unsupported cases, and behavior that may evolve between releases. Reproducible reports are an important part of maturing the project toward a stable 1.0 release.

Support is provided on a **best-effort** basis through the public GitHub project channels. There is no SLA or guaranteed response time, but clear reproducible reports and community participation are welcome.

- Use the [bug report form](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/issues/new?template=bug_report.yml) for reproducible defects.
- Use the [feature request form](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/issues/new?template=feature_request.yml) for proposed improvements.
- Follow [SECURITY.md](SECURITY.md) for sensitive vulnerabilities. Do not put vulnerability details in an ordinary public issue.

## Before opening a bug

If the problem involves connection state, catalog metadata, or completion based on physical database objects, run:

```text
Query Puppy for T-SQL: Show Status
```

and, when relevant:

```text
Query Puppy for T-SQL: Refresh Schema Metadata
```

A schema refresh is **not** required for purely document-local features such as local navigation, Outline, Hover, or high-confidence document diagnostics unless the specific issue also depends on catalog metadata.

## What makes a useful bug report

Include:

- Query Puppy for T-SQL version;
- Visual Studio Code or VSCodium version;
- Microsoft `ms-mssql.mssql` version;
- the affected feature area, such as completion, JOIN relationships, Signature Help, navigation, Hover, Outline, diagnostics, metadata/cache, or `mssql` integration;
- minimal anonymized T-SQL that reproduces the problem;
- the exact cursor position or symbol involved when relevant;
- expected behavior;
- actual behavior;
- whether the issue changes after **Refresh Schema Metadata**, when metadata is relevant;
- relevant redacted lines from **Output: Query Puppy for T-SQL** after enabling `queryPuppyForTSql.debugLogging`, when logs are useful.

For connection or metadata problems, also include the non-sensitive state shown by **Query Puppy for T-SQL: Show Status**.

Never include:

- passwords;
- access tokens;
- complete connection strings;
- private keys;
- sensitive production data;
- confidential SQL or schema names that are not required to reproduce the issue.

Replace confidential identifiers and values with anonymized equivalents where necessary.

## Feature requests

Describe the editing problem and the outcome you want.

A useful request explains:

- what T-SQL task is difficult today;
- a realistic anonymized example;
- whether Visual Studio Code, VSCodium, or Microsoft `mssql` already provides related behavior;
- what semantic value Query Puppy could add through scopes, types, metadata, relationships, navigation, or other existing semantic infrastructure.

Query Puppy is focused on SQL Server/T-SQL developer tooling. It is not intended to become a second query-execution or database-administration workbench.
