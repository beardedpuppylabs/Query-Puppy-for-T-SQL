# Direct SQL Server Metadata Backend Feasibility

Research date: 2026-08-28

## Decision

**DIRECT METADATA BACKEND FEASIBLE ONLY AS LIMITED FALLBACK**

`node-mssql` with its default Tedious driver can implement Query Puppy's current
metadata-only transport on the tested Linux/x64 SQL Server fixture without changing
the neutral contracts. It is the strongest direct candidate because it is pure
JavaScript, cross-platform, actively maintained, and already present as a development
dependency. The live prototype loaded both current catalog statements, enumerated
databases, loaded a second database, bounded requests, cancelled work, recovered its
pool, and closed resources.

That result does not solve the harder product problem: active editor connection
selection and production-quality authentication. SQL authentication is practical,
but Query Puppy would own a password path. Tedious does not provide transparent OS
single sign-on comparable to an ODBC trusted connection, and accepting an Entra
access token is not the same as providing interactive MFA, account selection, token
refresh, and secure editor integration. A direct backend should therefore remain a
limited fallback unless an official Microsoft API supplies active context and an
authentication/query delegation boundary.

## Evidence labels

- **MEASURED**: executed locally against the provisioned `IntelliSenseLab` and
  `IntelliSenseLabReporting` SQL Server fixtures.
- **SOURCE-DOCUMENTED**: stated by a current first-party project, package, or
  Microsoft source linked in [Sources](#sources); it was not locally exercised unless
  also marked MEASURED.
- **INFERRED / NOT YET VERIFIED**: architectural or operational judgement based on
  those sources; it still needs targeted production-design validation.

Tables below identify the evidence class that governs them. A support rating is not
a claim that every mode was locally tested.

## Question and scope

The question is whether Query Puppy can later acquire SQL Server catalog metadata
without coupling its semantic engine back to Microsoft mssql Connection Sharing.
This is not a proposal to make Query Puppy a general SQL client. A direct transport
would execute only fixed, read-only catalog operations needed for completion.

The spike does not implement query execution, connection UI, credential UI, Object
Explorer, schema changes, telemetry, or a production backend. The existing
`MssqlConnectionSharingAdapter` remains the only activated backend.

## Current architecture and requirements

**MEASURED from the working tree.** `ConnectionContextResolver` and
`MetadataBackend` are separate capabilities. `ActiveConnectionContext` contains an
opaque stable connection identity and active database. The current metadata backend
must:

1. accept an active context and an ordered list of fixed metadata statements;
2. execute the statements and return one result per statement in the same order;
3. preserve positional column order as `MetadataQueryResult.rows` and normalize every
   value to `{ isNull, displayValue }`;
4. enumerate accessible same-server databases as names;
5. throw bounded failures while keeping provider handles, credentials, native result
   types, and provider-specific lifecycle out of semantic consumers.

`MetadataLoader` currently issues exactly two set-based statements per database load:

- the catalog statement returns the database marker, schemas, tables, views,
  procedures, scalar functions, TVFs, synonyms, sequences, user types, columns, and
  parameters;
- the relationship statement returns primary/unique keys, unique indexes, and foreign
  keys.

It prefixes both with `USE [database]`. A cold load executes those two statements;
same-server cross-database metadata remains lazy. `MetadataCache` coalesces cold and
refresh work, hydrates persistent snapshots, and uses stale-while-revalidate, so a
future transport is not intended to query SQL Server on each keystroke.

## Candidate selection

### node-mssql with Tedious

Included because it is a current, Microsoft-supported, production-oriented Node SQL
Server client; Tedious is its default pure-JavaScript driver. It has the best packaging
fit for a VS Code/VSCodium extension and was the only candidate prototyped.

### msnodesqlv8

Included because it provides the strongest Windows Integrated authentication option
in the Node ecosystem and supports node-mssql's higher-level API. It was not
prototyped: its native addon, Microsoft ODBC Driver prerequisite, Electron ABI surface,
and cross-platform Kerberos deployment burden make it a weaker primary candidate even
before semantic transport is considered.

### SQL Tools Service

Included because vscode-mssql uses Microsoft's service for SQL tooling and
connectivity. It was evaluated as an external service rather than a Node driver. It
was not prototyped because there is no supported API for another extension to reuse
vscode-mssql's running service; independently downloading and driving it would create
a large process/protocol/authentication integration and a new Microsoft-version
coupling.

No other candidate had current evidence strong enough to justify expanding the spike.

## Comparison matrix

The support facts in this table are **SOURCE-DOCUMENTED**. Ratings and product-fit
judgements are **INFERRED / NOT YET VERIFIED**, except the node-mssql workload rows
that refer to the live prototype.

| Dimension                  | node-mssql / Tedious                                                                                              | msnodesqlv8                                                                              | SQL Tools Service                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| SQL Auth                   | **Strong**; direct username/password                                                                              | **Strong**; ODBC connection string                                                       | **Strong**; connection profile                                                         |
| Windows Integrated         | **Weak**; Tedious NTLM needs domain credentials, not transparent trusted connection                               | **Strong**; ODBC `Trusted_Connection` on Windows                                         | **Strong**; Microsoft.Data.SqlClient/service auth stack                                |
| Entra                      | **Acceptable**; fixed token, `TokenCredential`, service principal, managed identity, and default credential modes | **Acceptable**; ODBC Entra modes and externally supplied token                           | **Strong** capability, but standalone client/auth coordination is still burdensome     |
| Interactive MFA            | **Weak**; Query Puppy must own or receive an interactive credential/token flow                                    | **Acceptable** at ODBC-driver level; editor UX and lifecycle remain unverified           | **Strong** in Microsoft's integrated stack; independent reuse remains unverified       |
| Token refresh              | **Acceptable** with a renewable `TokenCredential`; **Weak** for a fixed supplied token                            | **Acceptable** when ODBC owns the auth mode; external-token refresh remains caller-owned | **Strong** within the Microsoft stack; standalone ownership boundary is unclear        |
| Windows                    | **Strong** for SQL Auth/token modes                                                                               | **Strong**, especially Integrated Auth                                                   | **Strong**, platform binary required                                                   |
| Linux                      | **Strong** for SQL Auth/token modes                                                                               | **Acceptable**; native addon + ODBC + Kerberos setup                                     | **Strong**, platform binary required                                                   |
| macOS                      | **Strong** for SQL Auth/token modes                                                                               | **Acceptable**; native addon + ODBC + Kerberos setup                                     | **Strong**, platform binary required                                                   |
| VS Code packaging          | **Strong**; pure JS transport, no driver install                                                                  | **Weak**; native ABI plus system ODBC                                                    | **Weak**; large external process and per-platform payload                              |
| VSCodium packaging         | **Strong** for SQL Auth; Entra account integration needs validation                                               | **Weak**; same native risk plus keyring/auth variability                                 | **Weak/Unknown**; independent service/auth integration requires validation             |
| Native dependencies        | **Strong**; none for Tedious                                                                                      | **Weak**; native Node addon and Microsoft ODBC Driver 17/18                              | **Weak**; external self-contained .NET service binaries                                |
| ABI/native binary risk     | **Strong**; ordinary JavaScript bundle                                                                            | **Weak**; Node/Electron/OS/architecture matrix                                           | **Acceptable**; no Node ABI, but every OS/architecture needs a matching service asset  |
| SecretStorage implications | **Weak** for persisted SQL passwords; tokens should normally remain ephemeral                                     | **Acceptable** with OS Integrated Auth, otherwise same secret burden                     | **Acceptable** only if auth stays delegated; weak if Query Puppy owns profiles/secrets |
| TLS/certificates           | **Strong** controls; production defaults are encryption on and certificate trust off                              | **Strong** ODBC 18 controls and strict mode                                              | **Strong** Microsoft.Data.SqlClient controls                                           |
| Cancellation               | **Acceptable**; `Request.cancel()`, measured `ECANCEL`                                                            | **Acceptable**; request cancellation documented                                          | **Strong** protocol/service support, not locally exercised                             |
| Timeout support            | **Strong** connection and per-request timeouts; measured `ETIMEOUT`                                               | **Acceptable**; ODBC query timeout, sub-second limits noted by node-mssql                | **Strong** connection/command facilities, not locally exercised                        |
| Pooling                    | **Strong** built-in bounded pool                                                                                  | **Strong** through node-mssql/driver                                                     | **Strong** service-managed connections                                                 |
| Same-server cross-db       | **Strong** on SQL Server via `USE`; measured                                                                      | **Strong** on SQL Server via `USE`                                                       | **Strong** on SQL Server; not locally exercised                                        |
| Metadata performance       | **Acceptable**; real 1,076-object fixture measured below                                                          | **Strong expected**, but **Unknown** locally                                             | **Strong expected**, but **Unknown** locally                                           |
| Maintenance health         | **Strong**; active node-mssql/Tedious releases                                                                    | **Acceptable**; active current release, smaller native-driver project                    | **Strong** Microsoft activity, but consumer compatibility is version-coupled           |
| Licensing                  | **Strong**; MIT for node-mssql/Tedious                                                                            | **Strong**; Apache-2.0 addon, separate ODBC redistribution terms                         | **Strong** source license (MIT); binary/transitive notices still require audit         |
| Implementation complexity  | **Acceptable** transport; **Weak** full auth/context ownership                                                    | **Weak** packaging and deployment complexity                                             | **Weak** process, protocol, binary, auth, and update lifecycle                         |
| Long-term maintenance risk | **Acceptable** for a limited SQL Auth fallback                                                                    | **Weak** because of native/ODBC/ABI matrix                                               | **Weak** because independent use replaces one Microsoft coupling with another          |

## Authentication matrix

This table is **SOURCE-DOCUMENTED** for driver capabilities and **INFERRED / NOT YET
VERIFIED** for what Query Puppy would need to own.

| Authentication mode           | node-mssql / Tedious                                                                                                                         | msnodesqlv8                                                                                       | SQL Tools Service                                                                        | Query Puppy ownership implication                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| SQL username/password         | Supported                                                                                                                                    | Supported                                                                                         | Supported                                                                                | Own profile fields and either session memory or encrypted SecretStorage; never log or cache them with metadata                 |
| Windows Integrated on Windows | Tedious NTLM takes username/password/domain and current docs warn Node 17+ needs `--openssl-legacy-provider`; not OS trusted SSO             | Native ODBC trusted connection                                                                    | Supported through Microsoft stack                                                        | Tedious loses the main passwordless advantage; ODBC/STS add deployment or coupling                                             |
| Integrated on Linux/macOS     | No transparent OS trusted path in Tedious                                                                                                    | ODBC Kerberos/GSSAPI; system realm, ticket, SPN, and driver setup required, with no NTLM fallback | Supported where Microsoft stack/system configuration supports it                         | Significant enterprise setup and support burden; no local validation was performed                                             |
| Entra fixed access token      | Supported                                                                                                                                    | ODBC access-token attribute                                                                       | Supported by underlying Microsoft stack                                                  | Caller must acquire securely, track expiry, refresh before reconnect, and avoid persistence/logging                            |
| Entra renewable credential    | Tedious `token-credential` accepts Azure Identity `TokenCredential`; other documented default/service-principal/managed-identity modes exist | ODBC can own selected Entra modes                                                                 | Microsoft stack has broad auth providers                                                 | Query Puppy still needs account selection, tenant/cloud configuration, consent, cancellation, and error UX unless delegated    |
| Interactive Entra/MFA         | No turnkey editor-integrated flow merely from accepting a token                                                                              | ODBC has Interactive mode, but editor/browser lifecycle is unverified                             | Best capability fit, but no supported independent vscode-mssql sharing surface was found | Requires a trusted authentication broker or a Query Puppy-owned Azure auth subsystem; neither was implemented                  |
| Service principal             | Supported by Tedious/Azure Identity                                                                                                          | Supported by current ODBC Entra modes                                                             | Supported by Microsoft stack                                                             | Client secrets/certificates are high-value credentials; a desktop extension should not normalize this as the default user path |
| Managed identity              | Documented for supported Azure environments                                                                                                  | Supported by ODBC in relevant Azure hosts                                                         | Supported by Microsoft stack                                                             | Useful for remote/cloud hosts, uncommon for a local desktop extension, and not locally tested                                  |

Accepting an access token proves only transport compatibility. It does not provide
interactive login, MFA, account and tenant selection, consent, sovereign-cloud
configuration, refresh, logout, or shared Microsoft extension identity.

## Platform and packaging matrix

Support facts are **SOURCE-DOCUMENTED**. Extension packaging conclusions are
**INFERRED / NOT YET VERIFIED**.

| Candidate          | Windows                                                                 | Linux                                                                                             | macOS                                                                    | VS Code/VSCodium consequence                                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| node-mssql/Tedious | JS on supported Node runtimes; x64/arm64 follow host Node               | Same                                                                                              | Same                                                                     | Best bundle fit. No install script, compiler, native addon, or system SQL driver is needed for Tedious. Entra browser/account UX still varies by editor distribution.                                                                         |
| msnodesqlv8        | Prebuilt native targets and ODBC 17/18 required; strongest Windows auth | Current project documents glibc/musl x64 binaries; ODBC and Kerberos required for Integrated Auth | Current project documents x64/arm64 binaries; ODBC and Kerberos required | Must match Electron's Node ABI or N-API support, ship/select native assets, diagnose system drivers, and test every editor/OS/arch combination. Source-build fallback is unsuitable for ordinary extension installation.                      |
| SQL Tools Service  | Separate Windows asset                                                  | Separate Linux asset                                                                              | Separate macOS asset                                                     | vscode-mssql downloads/starts a matching external service. A separate extension would need its own asset selection, extraction, execution, protocol monitoring, crash handling, updates, notices, and substantial package/download footprint. |

The current SQL Tools Service release publishes platform-specific service-layer
archives; one Linux x64 asset is roughly 75 MB. Its JSON-RPC-over-stdio guide is useful
for service contributors, but it is not a compatibility promise that another
extension may share vscode-mssql's instance. No supported independent reuse API was
found.

## TLS and certificate behavior

### Source-documented

- node-mssql/Tedious defaults `encrypt` to `true` and
  `trustServerCertificate` to `false`. Tedious exposes server-name validation and
  Node TLS secure-context options for custom trust material.
- Microsoft ODBC Driver 18 defaults encryption on; it supports certificate trust,
  strict encryption, hostname controls, and server certificate configuration.
- SQL Tools Service currently uses Microsoft.Data.SqlClient and inherits its modern
  TLS/certificate behavior through connection properties.
- Azure SQL expects encryption. SQL Server installations with old protocol support,
  missing certificates, name mismatches, or local self-signed certificates need
  explicit diagnosis and deliberate policy rather than a global trust bypass.

### Measured fixture results

- **MEASURED — strict production-style attempt:** `encrypt=true` and
  `trustServerCertificate=false` failed in about 0.88 seconds with sanitized
  `ESOCKET`; the pool still closed.
- **MEASURED — encryption-required with certificate trust relaxed:**
  `encrypt=true` and `trustServerCertificate=true` also failed with sanitized
  `ESOCKET`; the pool still closed.
- **MEASURED — established local integration configuration:** `encrypt=false` and
  `trustServerCertificate=true` connected and completed the workload.

The permissive local result is not evidence that strict TLS works. The sanitized
harness intentionally did not print the provider's potentially identifying error
message, so the exact server-side cause is **INFERRED / NOT YET VERIFIED**. A future
design would need a dedicated TLS diagnostic against a correctly certificated server
and must keep secure defaults.

## SecretStorage and credential ownership

**SOURCE-DOCUMENTED.** VS Code's `ExtensionContext.secrets` exposes encrypted,
extension-scoped get/store/delete operations. Secrets are not the metadata cache and
should not be synchronized into catalog snapshots. SecretStorage is an appropriate
primitive for a user-approved persisted SQL password or refresh credential, but it
does not perform authentication, token refresh, logout, migration, or connection
selection.

**INFERRED / NOT YET VERIFIED.** VSCodium implements the VS Code API, but desktop
secure storage depends on the host keyring/safe-storage environment. Reported Linux
keyring failures mean Query Puppy would need VSCodium acceptance tests, clear/remove
UX, failure handling, and a session-only fallback before owning credentials.

Credential consequences by path:

- SQL Auth: username is profile data; password can be session-only or explicitly
  persisted in SecretStorage. It must never enter logs, process arguments, metadata
  snapshots, crash output, or repository files.
- Windows/ODBC Integrated: avoids a stored database password but adds native-driver,
  OS account, SPN/Kerberos, and support dependencies.
- Entra fixed token: should remain ephemeral; expiry and reacquisition are caller
  responsibilities.
- Entra `TokenCredential`: can refresh tokens, but Query Puppy still owns or delegates
  the credential implementation and interactive lifecycle.
- SQL Tools Service: only avoids Query Puppy-owned secrets if an official supported
  Microsoft boundary also owns account/auth state. Launching an independent service
  does not itself provide that delegation.

## Prototype

### Method

**MEASURED.** The disposable harness is
`spike/direct-metadata/node-mssql-spike.ts`, type-checked by
`spike/tsconfig.json`. It is outside `src/`, is not imported by `extension.ts`, and
adds no package dependency, command, setting, profile, or credential store.

The harness uses installed `mssql` 12.7.0 with Tedious 20.0.0 on Node 26.7.0,
Linux x64. It receives the existing integration values through environment variables,
never prints them, uses one lazy pool (`min=0`, `max=1`), and closes it in `finally`.

It instantiates the real `MetadataLoader`. Therefore the executed workload is the
current catalog query and current relationship query, including their real `USE`
prefixes—not a `SELECT 1` substitute. `arrayRowMode` preserves duplicate names and
ordered positional cells. Known active and secondary fixture objects/columns are
checked after canonical mapping; only booleans, counts, timings, and sanitized error
codes are printed.

### Results

The following is one complete measured run using the repository's established local
fixture TLS settings. Timings are wall-clock observations, not guarantees.

| Operation                               | MEASURED result                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Connect                                 | 74.2 ms                                                                                  |
| Enumerate accessible databases          | 122.3 ms; 5 accessible; both requested fixtures present                                  |
| First active catalog load               | 1,579.7 ms total; 11,197 catalog rows in 1,022.6 ms; 569 relationship rows in 514.4 ms   |
| Canonical active index                  | 1,076 objects; expected positional fixture shape validated                               |
| Approximate heap delta after first load | 24,871,808 bytes (about 23.7 MiB); process-level observation, not isolated retained heap |
| Immediate repeated active load          | 1,007.0 ms; same 1,076 objects                                                           |
| Secondary database load                 | 364.1 ms; 70 objects; expected positional fixture shape validated                        |
| Ordinary SQL error                      | `EREQUEST` in 14.0 ms                                                                    |
| Explicit cancellation                   | `ECANCEL` in 108.2 ms after a 100 ms cancellation trigger                                |
| Per-request timeout                     | `ETIMEOUT` in 207.9 ms for a 200 ms limit                                                |
| Pool after probes                       | Database enumeration succeeded again                                                     |
| Cleanup                                 | `pool-closed` reported from `finally`                                                    |

This fixture is large enough to exercise thousands of objects/columns and hundreds
of relationships, but it is not a synthetic maximum ERP schema. Performance beyond
this scale is **INFERRED / NOT YET VERIFIED**. The existing persistent cache means the
repeat SQL timing is refresh cost, not per-keystroke cost.

### Database enumeration and cross-database behavior

**MEASURED.** A read-only query over `sys.databases` filtered to online databases with
`HAS_DBACCESS(name)=1` returned five accessible names and included both fixtures.
`MetadataLoader` then used the same authenticated server pool with `USE` to load the
secondary database successfully.

**SOURCE-DOCUMENTED.** SQL Server permits `USE` when the login can connect to the
target database. Azure SQL Database does not switch database context with `USE`; a
future direct backend would need a database-specific connection/pool using the same
credential identity. Database enumeration can be incomplete by design when the login
lacks visibility/access. That is not necessarily an error; explicit access denial for
a selected database must be surfaced cleanly.

## Error, timeout, cancellation, and connection lifetime

**MEASURED.** Tedious errors can be caught and sanitized behind the current boundary.
The prototype distinguished request failure (`EREQUEST`), cancellation (`ECANCEL`),
timeout (`ETIMEOUT`), and connection failure (`ESOCKET`) without exposing the server,
user, password, connection string, SQL text, or provider message. The pool remained
usable after request-level probes and closed on both successful and failed connection
paths.

**SOURCE-DOCUMENTED.** node-mssql exposes connection timeout, default and per-request
timeout, cancellation, bounded pools, and pool close. Network-loss behavior yields
provider errors and broken connections are not intended to be handed to semantic
consumers.

**INFERRED / NOT YET VERIFIED.** For Query Puppy's low-frequency loads, the likely
production shape is a small lazy pool per credential/server identity, `min=0`,
`max=1` or `2`, idle eviction, bounded connect/query timeouts, refresh coalescing, and
pool replacement when credentials/tokens/profile data change. Azure SQL requires a
database-specific pool. A short-lived connection per load is simpler and avoids stale
tokens but repeats authentication; an unbounded long-lived pool is inappropriate.
Network interruption and token-expiry recovery need explicit future fault injection.

## SQL Tools Service assessment

**SOURCE-DOCUMENTED.** SQL Tools Service is a separate .NET process spoken to over
JSON-RPC/stdio. vscode-mssql owns downloading the platform asset, launching it,
tracking requests, and coordinating connection/authentication state. The service
source is MIT and currently references Microsoft.Data.SqlClient, Azure Identity, and
MSAL packages.

**INFERRED / NOT YET VERIFIED.** The published protocol documentation is sufficient
for contributors and clients in the Microsoft stack, but no supported API was found
for Query Puppy to reuse vscode-mssql's already-authenticated service process.
Bundling or downloading another copy would require:

- OS/architecture asset resolution and a substantial binary download;
- process startup, shutdown, crash recovery, stdio framing, cancellation, and logs;
- profile/authentication and credential-service integration;
- protocol and server release compatibility tracking;
- security updates and third-party notice/redistribution review.

That would replace Connection Sharing with another tightly versioned Microsoft
infrastructure dependency while still failing to solve supported sharing of the
editor's active authenticated context. SQL Tools Service is therefore not recommended
as an independent Query Puppy backend. It remains attractive only behind a supported
official vscode-mssql API.

## msnodesqlv8 assessment

**SOURCE-DOCUMENTED.** msnodesqlv8 is an active Apache-2.0 native addon using Microsoft
ODBC Driver 17/18. Current project documentation lists Windows x64/ia32, Linux x64
(glibc and musl variants), macOS x64/arm64, current Node majors, and current Electron
targets. It supports pooling, streaming, cancellation, and Windows trusted
connections. On Linux/macOS, Integrated Auth is the ODBC driver's Kerberos/GSSAPI
flow, requiring a configured realm/ticket/SPN environment; Microsoft documents no
NTLM fallback there.

**INFERRED / NOT YET VERIFIED.** Its genuine Windows Integrated advantage does not
outweigh the product-wide requirement to support VS Code and VSCodium across three
operating systems. Query Puppy would inherit native ABI/prebuild selection, system
ODBC installation, Kerberos support, CI matrices, driver/certificate diagnostics, and
source-build failure modes. It could be reconsidered as a Windows-only optional
transport, but that would multiply backend and release surfaces. It was therefore not
prototyped in this spike.

## Licensing and redistribution

The license facts are **SOURCE-DOCUMENTED**; a final production dependency audit is
**NOT YET VERIFIED**.

- node-mssql and Tedious: MIT. Installed Azure Identity components are also
  permissively licensed, but a shipped auth stack would require a complete transitive
  notice/SBOM audit.
- msnodesqlv8: Apache-2.0. The Microsoft ODBC Driver is a separate system/native
  prerequisite with Microsoft redistribution terms; it must not be silently bundled
  without a legal and packaging review.
- SQL Tools Service: MIT source. Published binary assets contain .NET and NuGet
  dependencies whose notices and redistribution terms still require inspection.

No core candidate introduced an identified conflict with Query Puppy's active
`GPL-3.0-only` distribution model. That does not replace the mandatory adoption gate
or release-time dependency and binary audits.

## Security and privacy

The future backend must remain read-only and local-first. Fixed SQL should be
allow-listed inside the backend/loader boundary. It must not expose arbitrary user
query execution, provision fixtures, request DDL/DML rights, send metadata to a Query
Puppy service, or add telemetry.

Principal risks are:

- password/token leakage through logs, exception messages, connection strings,
  process arguments, environment dumps, crash output, or support bundles;
- persisting secrets beside metadata or allowing them into the existing snapshot
  serializer;
- globally disabling certificate validation to accommodate local servers;
- stale access tokens or pools surviving logout/profile changes;
- malicious or accidental SQL surface expansion beyond fixed metadata operations;
- SQL Tools Service child-process arguments/stdout/stderr exposing profile data;
- native ODBC/addon supply-chain and update lag.

The prototype used environment variables only for the disposable live run, printed no
values or provider messages, persisted nothing, ran no DDL/DML, and closed the pool.
Environment variables themselves can leak through process inspection or diagnostics,
so they are test transport—not a recommended production credential design.

## Architecture options

### Official mssql successor only

Lowest credential and context risk. Microsoft retains active editor selection,
account state, MFA, refresh, and SQL connectivity. This remains the preferred path if
the successor API provides active context, read-only catalog execution, database
enumeration, change notification, and no raw password exposure.

### Fully Query Puppy-owned context and direct backend

Technically viable for a constrained SQL Auth profile. It requires new profile,
selection, secrets, TLS, authentication, status, migration, error, and lifecycle UX.
That is disproportionately large for a metadata-only extension and would duplicate
parts of a SQL client.

### Hybrid official context resolver plus direct metadata transport

Potentially the strongest fallback architecture. An official resolver could preserve
the editor's selected server/database while Tedious performs only Query Puppy's fixed
catalog reads. It is viable only if Microsoft exposes a supported way to bind that
opaque context to an authorized endpoint or short-lived token/credential/query broker
without raw password scraping.

The existing opaque `connectionIdentity` can key a private registry shared by a
co-designed resolver/backend. It cannot magically turn an unrelated resolver's
identity into server/auth material. That is an external integration dependency, not
evidence that semantic consumers should receive endpoints or credentials.

## Neutral contract assessment

**MEASURED.** The existing `MetadataBackend` was sufficient for the Tedious prototype:
ordered statements mapped cleanly to ordered neutral results, database enumeration
fit the existing method, `MetadataLoader` required no change, and driver lifecycle and
errors remained private. `ActiveConnectionContext` also remained sufficient for
cache/database routing.

No neutral contract change is justified by this spike. Provider-internal pooling,
timeouts, per-database Azure pools, token refresh, and error translation belong inside
a concrete backend. If a future official context resolver and independent direct
backend cannot share an authorization binding, the missing capability must be
designed at their composition/authentication boundary—not solved by putting raw
credentials or provider handles into `ActiveConnectionContext`.

The current interface has no cancellation signal or structured neutral error type.
The prototype shows internal timeouts/cancellation and ordinary thrown errors are
sufficient for current production behavior. A user-cancellable metadata operation or
cross-backend diagnostic taxonomy would be a separate evidenced requirement and
architecture review, not a spike-driven change now.

## Candidate verdicts

- **node-mssql / Tedious — VIABLE WITH MAJOR CAVEATS.** Best transport and packaging
  candidate; proven for SQL Auth on Linux against both real fixtures. Full connection
  context, Integrated Auth, interactive Entra/MFA, TLS UX, and credential ownership
  remain major product work.
- **msnodesqlv8 — VIABLE WITH MAJOR CAVEATS.** Technically capable and strongest for
  Windows Integrated Auth, but native addon/ODBC/ABI/cross-platform deployment makes
  it unsuitable as the primary direct backend.
- **SQL Tools Service — NOT RECOMMENDED.** Capable infrastructure, but independent use
  creates a heavy process/protocol/binary/auth/version coupling without a supported
  way to share vscode-mssql's active authenticated instance.

## Microsoft issue impact

The direct transport result makes
[microsoft/vscode-mssql#22819](https://github.com/microsoft/vscode-mssql/issues/22819)
more focused, not less important. Query Puppy no longer needs Microsoft to prove that
fixed catalog SQL can travel over TDS. It still needs the high-value pieces a direct
driver does not safely supply: active SQL editor context, stable identity and database,
change notification, and preferably authenticated read-only execution or a short-lived
authorization/token broker with no raw password exposure.

Until Microsoft provides that supported boundary, a hybrid cannot preserve mssql-owned
selection/authentication, and a full direct implementation would force Query Puppy to
become a connection-profile and authentication product.

## Open questions

All items here are **INFERRED / NOT YET VERIFIED**:

1. What exact TLS/server capability caused the fixture's encrypted Tedious attempt to
   fail, and does a correctly certificated SQL Server succeed with strict validation?
2. Will the mssql successor API expose active context plus read-only execution, token
   delegation, or a secure authorization binding usable by a separate transport?
3. Which Entra flows are required by the real user base, including sovereign clouds,
   conditional access, MFA, and account switching?
4. How reliable is SecretStorage across supported VSCodium Linux keyring setups, and
   what session-only failure UX is acceptable?
5. How does Tedious recover from injected network loss and token expiry during a large
   two-statement refresh?
6. What are memory/latency ceilings on a substantially larger ERP catalog than the
   measured 1,076-object fixture?
7. Can Azure SQL database enumeration and database-specific pooling preserve current
   same-server lazy semantics under least-privilege access?

## Exact next step

Perform one focused hybrid API-compatibility design slice when Microsoft responds to
issue #22819: validate whether its supported successor can provide active context and
a credential-free authorization/query binding to a Tedious metadata transport, without
exposing raw passwords or changing semantic consumers. Do not start production direct
backend work before that boundary is known.

## Sources

Authoritative/current sources consulted:

- [node-mssql repository and documentation](https://github.com/tediousjs/node-mssql)
- [Tedious connection/authentication/TLS API](https://tediousjs.github.io/tedious/api-connection.html)
- [Tedious current connection source, including token-credential support](https://github.com/tediousjs/tedious/blob/master/src/connection.ts)
- [msnodesqlv8 repository and platform/driver documentation](https://github.com/TimelordUK/node-sqlserver-v8)
- [Microsoft ODBC Integrated Authentication on Linux/macOS](https://learn.microsoft.com/en-us/sql/connect/odbc/linux-mac/using-integrated-authentication?view=sql-server-ver17)
- [Microsoft ODBC Entra authentication](https://learn.microsoft.com/en-us/sql/connect/odbc/using-azure-active-directory?view=sql-server-ver17)
- [Microsoft ODBC connection/TLS attributes](https://learn.microsoft.com/en-us/sql/connect/odbc/dsn-connection-string-attribute?view=sql-server-ver17)
- [SQL Server `USE` behavior, including Azure SQL](https://learn.microsoft.com/en-us/sql/t-sql/language-elements/use-transact-sql?view=sql-server-ver17)
- [SQL Tools Service repository](https://github.com/microsoft/sqltoolsservice)
- [SQL Tools Service JSON-RPC client guide](https://github.com/microsoft/sqltoolsservice/blob/main/docs/guide/using_the_jsonrpc_api.md)
- [SQL Tools Service protocol guide](https://github.com/microsoft/sqltoolsservice/blob/main/docs/guide/jsonrpc_protocol.md)
- [SQL Tools Service releases](https://github.com/microsoft/sqltoolsservice/releases)
- [SQL Tools Service dependency versions](https://github.com/microsoft/sqltoolsservice/blob/main/Packages.props)
- [vscode-mssql architecture](https://github.com/microsoft/vscode-mssql/wiki/architecture)
- [vscode-mssql repository](https://github.com/microsoft/vscode-mssql)
- [VS Code SecretStorage API](https://code.visualstudio.com/api/references/vscode-api#SecretStorage)
- [VS Code common capabilities and secret storage](https://code.visualstudio.com/api/extension-capabilities/common-capabilities)
- [VSCodium Linux keyring/safe-storage compatibility report](https://github.com/VSCodium/vscodium/issues/1563)
- [Query Puppy's tracked mssql successor request](https://github.com/microsoft/vscode-mssql/issues/22819)
