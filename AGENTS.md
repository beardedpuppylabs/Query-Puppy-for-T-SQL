# Repository guide

- `src/mssql`: public mssql API adapter and catalog loading.
- `src/metadata`: typed catalog, cache, and SQL type formatting.
- `src/parser`: defensive tokenizer and document context/symbol resolution.
- `src/completion`: pure matching/ranking/candidate logic plus VS Code presentation/provider.
- `src/commands`: user commands. `tests`: Node unit tests. `docs`: living plan.

Use strict TypeScript and keep VS Code types at the presentation boundary. Never manage credentials, open an independent SQL connection, consume mssql completion output, query per keystroke, or depend on private mssql modules. Metadata access must always identify both connection and database, and secondary databases load only after explicit qualification. Linked Server discovery is out of scope. Matching is contiguous case-insensitive contains; only exact matches receive name-based priority.

Commands: `npm run build`, `npm test`, `npm run lint`, `npm run format:check`, `npm run package`.

Definition of Done requires passing formatting, lint, strict compilation, unit tests, bundling and VSIX packaging; an updated plan and README; graceful disconnected/error behavior; and review of the final diff for placeholders and unsafe integration assumptions.
