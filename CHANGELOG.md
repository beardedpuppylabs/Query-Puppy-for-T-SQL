# Changelog

All notable changes are recorded here. This project has not had a public Marketplace release yet.

## 0.4.0 — Preview release candidate

- Added contiguous, case-insensitive Contains completion with deterministic semantic and alphabetical sorting.
- Added metadata-rich completion for schemas, tables, views, table-valued and scalar functions, stored procedures, synonyms, columns, CTEs, table variables, and temporary tables.
- Added alias-member, schema-qualified, same-server cross-database, double-dot, and database-wide shortcut completion.
- Added curated `sys` and common `INFORMATION_SCHEMA` completion targets.
- Added connection/database-scoped metadata caching, explicit refresh, status diagnostics, and optional debug logging.
- Reused the active Microsoft mssql connection without separate credentials or per-keystroke catalog queries.
- Added a consent-based, one-time prompt for disabling overlapping Microsoft SQL suggestions.
- Added Marketplace metadata, extension dependency, icon, release documentation, and a minimal bundled package.
- Released the project as free and open source software under the MIT License.
