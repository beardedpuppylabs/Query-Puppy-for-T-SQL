# Changelog

## 0.9.0

- Added expected-type-aware expression completion and conservative compatibility ranking for comparisons, function arguments, UPDATE assignments, INSERT expressions, LIKE, and arithmetic operands.
- Added a reusable normalized SQL type model and expression inference for catalog/query-local columns, literals, CAST/CONVERT, scalar UDF returns, arithmetic, and CASE.
- Preserved Contains matching, explicit qualifier scope, and incompatible visible candidates instead of turning type intelligence into a hard filter.
- Added visible `Type match`, compatible-family, and other-column groups when a known expected type changes completion order.
- Fixed UPDATE RHS inference through target aliases with a depth-aware positional assignment model, including incomplete and later SET right-hand sides.
- Restored exact alphabetical member ordering when no expected type is available.
- Stabilized physical-column presentation with a fixed 32-character visible identifier cap and wrapped complete documentation while preserving filtering, insertion, identity, and ordering.
- Rebound inferred physical RowSources to canonical catalog objects before type grouping so PK/UQ/FK roles and constraint documentation are retained.
- Rendered physical columns through one canonical factory as a deterministic 32/8/20-slot visible row and migrated the public extension identity to `BeardedPuppyLabs.improved-sql-intellisense`.
- Fixed identity-less forward member aliases in multi-group UPDATE completion by rebinding them to cached canonical table metadata before materialization.
- Ordered type groups before CompletionItem construction so every group member uses the ordinary physical-column factory exactly once.

## 0.8.5

- Reworked the Marketplace overview around context-aware completion for large SQL Server schemas.
- Documented Schema Intelligence, FK-aware JOIN predicates, query-local scope handling, connection reuse, caching, and read-only metadata access.
- Replaced outdated limitations and refreshed commands, settings, installation, privacy, and public package metadata.

## 0.8.3

- Reworked physical-column completion presentation into one bounded, table-like metadata layout with stable name, role, datatype, and nullability columns.
- Preserved complete PK/UQ/FK, datatype, and nullability information without altering filtering, sorting, or inserted identifiers.

## 0.8.2

- Fixed missing whitespace when accepting an FK JOIN predicate directly after `ON` while preserving existing spaces, newlines, indentation, and partial-predicate replacement.
- Moved compact PK/UQ/FK roles ahead of datatype and nullability so Schema Intelligence metadata remains visible in native completion lists.

## 0.8.1

- Added FK-aware JOIN predicate completion using real cached SQL Server relationships, including reverse query order, composite keys, cross-schema targets, and multiple relationships between the same tables.
- Added relationship-aware JOIN table ranking in both FK directions while excluding disabled relationships and preserving Contains filtering.
- Improved bounded visual alignment of physical-column datatype, nullability, and PK/UQ/FK metadata in native completion lists.

## 0.8.0

- Load primary keys, unique constraints/indexes, filtered unique indexes, and foreign keys with a constant number of set-based catalog queries.
- Preserve composite key/FK order, relationship direction, cross-schema targets, referential actions, and disabled/untrusted state in bidirectional indexes.
- Annotate physical table-column completions with compact `PK`, `UQ`, and `FK` roles while retaining SQL type/nullability and rich relationship documentation.
- Keep incoming references available to the graph/documentation without incorrectly tagging principal columns as foreign-key columns, and retain same-named objects from different schemas in database-wide completion.
- Align physical-column datatype, nullability, and PK/UQ/FK role fields within each native completion set using bounded candidate-derived widths; insertion, matching, sorting, and replacement behavior are unchanged.
- Add the persistent idempotent `reltest`/`relref` Schema Intelligence fixture. JOIN predicate generation and relationship-based ranking remain intentionally out of scope.

## 0.7.7

- Fixed JOIN-condition completion leaking aliases from later JOIN clauses.
- Fixed smart-alias collision detection across unrelated SQL statements.

## 0.7.6

- Added clause-aware expression completion for SELECT, WHERE, JOIN ON, GROUP BY, HAVING, and ORDER BY.
- Added SELECT projection-alias completion in ORDER BY.
- Improved function-argument completion and filtering of irrelevant catalog objects.
- Added set-result-aware final ORDER BY completion.

## 0.7.5

- Fixed column inference for wildcard projections in `UNION`, `INTERSECT`, and `EXCEPT` queries.
- Fixed and strengthened local and correlated member completion inside set-operation branches.

## 0.7.4

- Added semantic projection reconciliation for `UNION`, `UNION ALL`, `INTERSECT`, and `EXCEPT`, including SQL Server operator precedence and first-branch result names.
- Isolated set-operation branch aliases while preserving valid outer correlation and same-server cross-database metadata identity.
- Added set-result completion and wildcard expansion for CTEs, derived tables, and APPLY row sources.

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
