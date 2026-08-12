# Changelog

## 0.4.2

- Improved setup handling for overlapping Microsoft mssql suggestions.
- Added effective workspace and workspace-folder override handling.
- Added clearer diagnostics when Microsoft suggestions remain enabled.
- Improved Marketplace documentation and first-run guidance.

## 0.4.1

First public preview release.

- Added true case-insensitive Contains completion for SQL Server objects.
- Added context-aware completion for schemas, tables, views, functions, procedures, aliases, columns, and local row sources.
- Added datatype, nullability, function-signature, and procedure-signature information.
- Added schema-qualified and same-server cross-database completion.
- Added database-wide object search across schemas.
- Added useful `sys` and `INFORMATION_SCHEMA` completion.
- Added per-database metadata caching, refresh, and diagnostics.
- Reused the active Microsoft mssql connection without separate credentials.
