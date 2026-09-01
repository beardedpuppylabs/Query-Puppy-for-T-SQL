# SQL Type System

## Purpose

Query Puppy for T-SQL uses a conservative normalized SQL type model to support:

- expression type inference
- expected-type detection
- compatibility ranking
- Signature Help integration
- type-aware completion

The goal is useful IntelliSense, not a complete SQL Server compiler.

Candidate ordering and materialization are defined in the
[Completion Pipeline](COMPLETION_PIPELINE.md); scope and metadata ownership are
defined in [Architecture](ARCHITECTURE.md).

## Core principle

Type inference should prefer:

    correct conservative Unknown

over:

    confident but wrong type

Type-aware intelligence normally ranks candidates rather than removing them.

## Normalized descriptor

The implementation should expose one shared normalized type representation.

Conceptually:

    SqlTypeDescriptor
    {
        sqlName
        normalizedName
        family

        length?
        precision?
        scale?

        nullable?

        userDefined?
        underlyingSystemType?

        confidence/provenance?
    }

Exact implementation names may differ.

## Preserve declaration metadata

The normalized model must retain facets needed for correct SQL declaration display.

Examples:

    varchar(50)
    nvarchar(200)
    decimal(18,4)
    datetime2(3)
    datetimeoffset(7)
    varbinary(max)

Internal metadata may contain additional normalization information.

Do not expose internal normalization facets as fake SQL syntax.

## Type families

The implementation may use families such as:

- integer
- decimal/numeric
- floating point
- numeric
- string
- Unicode string
- date/time
- time
- binary
- boolean/bit
- GUID
- XML
- variant
- user-defined
- unknown

The exact hierarchy is implementation-specific.

The important property is shared consistent compatibility reasoning.

## Compatibility

Conceptually, compatibility includes tiers like:

    Exact
    SameBaseType
    CompatibleFamily
    Unknown
    Incompatible

### Exact

Examples:

    bigint -> bigint
    uniqueidentifier -> uniqueidentifier
    decimal(18,2) -> decimal(18,2)

### Same base type

Examples:

    decimal(18,4) against decimal(18,2)
    varchar(20) against varchar(50)

### Compatible family

Examples:

    int against bigint
    bigint against decimal
    varchar against nvarchar
    datetime2 against datetimeoffset

Compatibility should remain conservative.

## SQL Server implicit conversion

Do not blindly model every SQL Server implicit conversion as a high-quality
IntelliSense match.

For example, a string may technically be convertible to a date at runtime, but an
arbitrary varchar expression should not necessarily rank as a strong date
candidate.

The model should optimize developer usefulness, not mechanically duplicate every
runtime conversion possibility.

## Unknown

Unknown is a first-class state.

If a type cannot be inferred reliably, return Unknown.

Do not guess merely to activate type-aware ranking.

If there is no reliable ExpectedType, completion ordering falls back to the normal
non-type-aware contract.

## Physical columns

Catalog-backed physical columns are high-confidence type sources.

Their normalized type should be derived once from catalog metadata where practical,
not reparsed from display strings on each completion request.

## Local projected columns

Type metadata should propagate through local RowSources where known.

Examples:

- CTE projections
- derived tables
- APPLY projections
- temp tables
- table variables
- set-operation result columns
- aliases

Known type information should not be discarded unnecessarily.

## Literals

Conservative literal inference may include:

    1
        integer

    1.25
        decimal/numeric

    'abc'
        varchar

    N'abc'
        nvarchar

    0x...
        varbinary

    NULL
        unknown/null-like

Do not overfit literal precision rules unless required for correctness.

## CAST

The result of:

    CAST(expression AS target_type)

is the target type.

## CONVERT

The result of:

    CONVERT(target_type, expression)

is the target type.

## Parentheses

Parenthesized expressions preserve the inferred inner type.

## Scalar functions

Catalog-backed scalar UDF return metadata should be used when inferring the type of
a function call.

Supported built-ins use the same callable-signature path. Parameters may express
an exact type, an accepted normalized type-family set, a same-type argument
relationship, variadic ownership, or special SQL grammar with no ExpectedType.
Return rules may be fixed, argument-derived, precedence-derived, or
datatype-dependent.

The bounded SQL Server 2022 catalog covers the original string/date functions plus
common null/value, string, date/time, numeric, aggregate, and window families.
`COUNT`/`COUNT_BIG` have distinct fixed returns; `SUM`/`AVG` apply documented
numeric promotions; `MIN`/`MAX` and `LAG`/`LEAD` derive from their expression;
ranking functions return `bigint`. `DATEADD` number remains integer-family rather
than adopting preview-only bigint behavior.

TVFs are RowSources, not scalar expressions.

## Arithmetic

Basic arithmetic may infer numeric families conservatively.

Do not implement full SQL Server precision/scale propagation unless explicitly
required.

For `+`, remember T-SQL may represent numeric addition or string concatenation.

Use known operand families conservatively.

## CASE

Searched and simple CASE expressions collect top-level `THEN`/`ELSE` branch types
with depth-aware CASE ownership. Known branches use the shared SQL Server
data-type-precedence table, including safe facet reconciliation for the selected
base type. Literal NULL and an absent ELSE do not erase a known result. An
unresolved non-NULL branch remains Unknown. Incomplete editor-state CASE text may
still produce a useful result when the known branch set is safe.

## ISNULL / COALESCE

`ISNULL` retains SQL Server's first-argument return rule; a literal NULL first
argument uses the replacement type. Its replacement ExpectedType follows a known
first argument. `NULLIF` returns its first expression and uses that known type for
its comparison argument.

`COALESCE` is expression-like rather than a catalog scalar function. It reuses the
shared depth-aware call site for practical variadic arguments and resolves its
result through the same precedence facility as CASE. Literal NULL arguments are
ignored for selection; an unresolved non-NULL argument yields Unknown. A reliable
surrounding comparison or earlier argument may provide ExpectedType without ever
broadening explicit qualifier membership.

## SQL Server data-type precedence

One shared precedence facility selects CASE/COALESCE result types from known
system types. It is separate from completion compatibility: precedence models a
result type, while compatibility controls ranking usefulness. Unsupported types,
conflicting user-defined types, or unresolved non-NULL inputs remain Unknown.

## Set operations

UNION / UNION ALL / INTERSECT / EXCEPT result types are reconciled by ordinal.

The current implementation is intentionally conservative.

Do not claim full SQL Server type-precedence compatibility unless it is actually
implemented.

## ExpectedType

ExpectedType represents what kind of expression is useful at the current cursor
position.

Potential sources include:

- comparison operand
- function parameter
- UPDATE assignment target
- INSERT target column
- arithmetic operand
- LIKE
- other explicitly supported contexts

All contexts use the same normalized type model.

## Comparisons

For operators such as:

    =
    <>
    !=
    <
    <=
    >
    >=

a reliably typed operand may provide the ExpectedType of the opposite operand.

Both operand directions should use the same service.

JOIN ON uses the same comparison type logic as WHERE.

## Function arguments

The shared callable resolver provides the signature and active parameter used to
derive ExpectedType for the active argument. Catalog UDFs/TVFs are one signature
source; future built-ins must use the same callable model.

Reuse the existing active-parameter parser/state.

Do not create a separate argument-index parser only for type ranking.

Scalar callable return inference consumes the same callable resolution. TVFs remain
RowSources and do not acquire scalar return types through this abstraction.

## Stored-procedure Signature Help

Procedures are not expression callables and do not use function-parenthesis parsing.
The DML call analyzer owns `EXEC`/`EXECUTE` name and argument parsing, then resolves the
procedure through the same kind-aware catalog-object boundary used by DML parameter
completion. Native Signature Help reuses canonical `ParameterMetadata`, declaration
order, canonical SQL type formatting, `OUTPUT`, and active named/positional argument
selection. Procedure arguments do not become a second ExpectedType or callable-return
system.

## UPDATE

UPDATE SET assignments are positional.

Example:

    SET
        CustomerId = c.CustomerId,
        ExternalReference = c.

At the second RHS the ExpectedType comes from:

    ExternalReference

not from the first assignment.

Assignment parsing must respect nesting and incomplete SQL.

## INSERT

INSERT expression positions may derive ExpectedType from explicit target-column
ordinals.

Supported forms may include:

    INSERT ... VALUES
    INSERT ... SELECT

If mapping is incomplete or ambiguous, return no reliable ExpectedType rather than
guessing.

## LIKE

A string expression on one side of LIKE may produce a string-family ExpectedType
for the other side.

## Type-aware completion behavior

ExpectedType affects ranking.

It does not normally hide visible candidates.

Conceptually:

    strong type match
        ->
    compatible family
        ->
    unknown
        ->
    apparently incompatible

Within equivalent semantic tiers, candidates remain alphabetical.

## Display groups

Internal compatibility enums and user-facing groups are different concepts.

The UI may combine several internal tiers into:

    Type match · <type>
    Compatible <family>
    Other visible columns

Do not leak implementation enum names into the UX merely because they exist.

## Canonical SQL type display

One shared SQL type display formatter is used by:

- physical-column rows
- documentation
- type group headers
- other type-aware presentation where appropriate

Examples:

    bigint
    uniqueidentifier
    varchar(50)
    decimal(38,18)

Do not display:

    bigint(19,0)
    uniqueidentifier(16)

unless the actual declared SQL type syntax genuinely contains such facets.

## Extending built-in function intelligence

Additional SQL Server built-in definitions may provide:

- parameter types
- return types
- Signature Help
- richer ExpectedType contexts

They must reuse this type system.

Do not create a second built-in-specific type engine.

It must also plug into the shared call-site and callable-signature boundary used by
Signature Help, ExpectedType, and scalar return inference.
