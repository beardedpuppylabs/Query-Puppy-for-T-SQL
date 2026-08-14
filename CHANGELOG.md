# Changelog

## 0.7.3

- Fixed semantic member completion inside nested and correlated query scopes.
- Added Query Scope diagnostics and reliable provider-origin verification for nested completions.

## 0.7.2

- Fixed correlated outer-alias completion in nested subqueries and APPLY expressions.

## 0.7.1

- Fixed incomplete column inference for `TOP`, `DISTINCT`, and `ALL` queries used in CTEs, derived tables, and APPLY expressions.

## 0.7.0

- Added nested query scope awareness and correlated subquery completion for outer aliases.
- Added local-first alias resolution, lexical shadowing, and isolation between inner, outer, sibling, CTE, and statement scopes.
- Added APPLY-aware left-side correlation while keeping ordinary derived tables non-correlated.
- Added scope-aware column ordering and concise outer-scope origin details.

## 0.6.6

- Added explicit Tab-only expansion of semantic `SELECT *` and `alias.*` projections using cached row-source columns.
- Added smart, editable `AS` alias suggestions after tables, views, CTEs, local row sources, and TVFs.

## 0.6.5

- Fixed automatic Signature Help when typing function-call parentheses and argument commas.
- Improved Signature Help reliability with auto-closing parentheses in VS Code and VSCodium.

## 0.6.4

- Fixed automatic Signature Help activation for user-defined functions.
- Fixed scalar-function Signature Help resolution in interactive SQL editors.

## 0.6.3

- Fixed automatic Signature Help activation for scalar and table-valued functions in SQL editors.
- Improved diagnostics for disabled parameter hints.

## 0.6.2

- Fixed Signature Help for user-defined scalar and table-valued functions.
- Fixed active-parameter tracking for nested function arguments.

## 0.6.1

- Fixed UPDATE SET completion for directly qualified table targets.
- Fixed Signature Help triggering and active-parameter tracking for scalar and table-valued functions.
- Fixed `deleted` completion in DELETE and UPDATE OUTPUT clauses.
- Fixed incomplete `inserted`/`deleted` column matching.
- Fixed DML target metadata leaking between statements.

## 0.6.0

- Added writable-column completion for INSERT target lists and UPDATE SET targets, excluding identity, computed, generated, hidden, and rowversion columns.
- Added named stored-procedure parameter completion for EXEC/EXECUTE, including used-parameter exclusion and OUTPUT details.
- Added scalar and table-valued function signature help with nested-call-aware active parameter tracking.
- Added INSERT/UPDATE/DELETE OUTPUT completion for the synthetic `inserted` and `deleted` row sources.
- Extended same-server cross-database metadata resolution to DML targets, procedures, and callable signatures.

## 0.5.1

- Fixed column-scope leakage between multiple CTEs.
- Fixed `SELECT *` column inference for CTEs and local row sources.
- Fixed alias-member completion for CTEs backed by cross-database sources.

## 0.5.0

- Added column-aware completion for CTEs, including projection aliases and explicit column lists.
- Added typed completion for local and global temporary tables and table variables.
- Added SELECT INTO column inference, including aliases and resolvable star projections.
- Added derived-table and VALUES row-source completion.
- Added CROSS APPLY and OUTER APPLY row-source support.
- Added SELECT projection aliases in ORDER BY completion.

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
