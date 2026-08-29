import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createCandidates,
  type CompletionScope,
} from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import type {
  ColumnMetadata,
  DatabaseMetadata,
  SqlType,
} from "../src/metadata/MetadataModels.js";
import { analyzeDocumentSemantics } from "../src/parser/DocumentSemanticAnalyzer.js";
import {
  resolveSmartAliasContext,
  type SmartAliasContext,
} from "../src/parser/SmartAlias.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const column = (
  name: string,
  type: SqlType,
  ordinal: number,
  nullable = true,
): ColumnMetadata => ({
  name,
  normalizedName: name.toLocaleLowerCase("en-US"),
  type,
  nullable,
  ordinal,
});

const customers = [
  column("CustomerId", { name: "bigint" }, 1, false),
  column("RegionId", { name: "int" }, 2),
  column("CustomerNumber", { name: "varchar", maxLength: 30 }, 3, false),
  column("DisplayName", { name: "nvarchar", maxLength: 200 }, 4),
  column("ExternalKey", { name: "uniqueidentifier" }, 5),
  column("Amount", { name: "decimal", precision: 18, scale: 2 }, 6),
];

const metadata: DatabaseMetadata = {
  database: "IntelliSenseLab",
  schemas: ["qpacc"],
  loadedAt: 0,
  objects: [
    {
      id: 1,
      schema: "qpacc",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      columns: customers,
      parameters: [],
    },
    {
      id: 2,
      schema: "qpacc",
      name: "OrderHeaders",
      normalizedName: "orderheaders",
      kind: "table",
      columns: [
        column("CustomerId", { name: "bigint" }, 1, false),
        column("HeaderCode", { name: "varchar", maxLength: 30 }, 2, false),
      ],
      parameters: [],
    },
    {
      id: 3,
      schema: "qpacc",
      name: "OrderLines",
      normalizedName: "orderlines",
      kind: "table",
      columns: [
        column("OrderLineId", { name: "bigint" }, 1, false),
        column("Quantity", { name: "decimal", precision: 18, scale: 2 }, 2),
        column("LineText", { name: "nvarchar", maxLength: 100 }, 3),
      ],
      parameters: [],
    },
    {
      id: 4,
      schema: "qpacc",
      name: "CompletionLayoutStress",
      normalizedName: "completionlayoutstress",
      kind: "table",
      columns: [
        column("Id", { name: "bigint" }, 1, false),
        column("ExternalReference", { name: "uniqueidentifier" }, 2),
      ],
      parameters: [],
    },
    {
      id: 5,
      schema: "qpacc",
      name: "CalculateBillingTotal_Manual",
      normalizedName: "calculatebillingtotal_manual",
      kind: "scalarFunction",
      columns: [],
      parameters: [
        {
          name: "@NetAmount",
          type: { name: "decimal", precision: 18, scale: 2 },
          output: false,
          ordinal: 1,
        },
        {
          name: "@TaxRate",
          type: { name: "decimal", precision: 9, scale: 4 },
          output: false,
          ordinal: 2,
        },
      ],
      returnType: { name: "decimal", precision: 18, scale: 2 },
    },
    ...["Belege", "BelegePositionen", "BelegePositionenDetails"].map(
      (name, index) => ({
        id: 10 + index,
        schema: "qpacc",
        name,
        normalizedName: name.toLocaleLowerCase("en-US"),
        kind: "table" as const,
        columns: [column("Id", { name: "bigint" }, 1, false)],
        parameters: [],
      }),
    ),
  ],
  keys: [
    {
      database: "IntelliSenseLab",
      objectId: 1,
      schema: "qpacc",
      objectName: "Customers",
      name: "PK_qpacc_Customers",
      kind: "primaryKey",
      columns: [{ columnId: 1, columnName: "CustomerId", ordinal: 1 }],
      filtered: false,
    },
    {
      database: "IntelliSenseLab",
      objectId: 1,
      schema: "qpacc",
      objectName: "Customers",
      name: "UX_qpacc_Customers_ExternalKey",
      kind: "uniqueIndex",
      columns: [{ columnId: 5, columnName: "ExternalKey", ordinal: 1 }],
      filtered: false,
    },
  ],
};

const databaseIndex = new DatabaseIndex(metadata);
const scope: CompletionScope = {
  activeDatabase: "IntelliSenseLab",
  indexes: new Map([["intellisenselab", databaseIndex]]),
};

const markedCandidates = (markedSql: string) => {
  const cursor = markedSql.indexOf("|");
  assert.ok(cursor >= 0, "contract SQL requires a cursor marker");
  const sql = markedSql.replace("|", "");
  return createCandidates(
    resolveSqlContext(sql, cursor),
    scope,
    analyzeDocumentSemantics(sql, cursor, scope),
  );
};

test("contract: explicit qualifier owns comparison members before ExpectedType ranking", () => {
  const candidates = markedCandidates(`SELECT *
FROM qpacc.OrderHeaders AS oh
JOIN qpacc.Customers AS c ON oh.CustomerId = c.|`);
  const names = candidates.map((candidate) => candidate.name);
  assert.equal(names[0], "CustomerId");
  assert.ok(names.includes("ExternalKey"));
  assert.equal(names.includes("HeaderCode"), false);
  assert.equal(candidates[0]?.typeCompatibility, "exact");
  assert.deepEqual(candidates[0].keyRoles, ["PK"]);
});

test("contract: qualified members survive a complete catalog callable argument", () => {
  const candidates =
    markedCandidates(`SELECT qpacc.CalculateBillingTotal_Manual(ol.|, 0.19)
FROM qpacc.OrderLines AS ol;`);
  assert.equal(candidates[0]?.name, "Quantity");
  assert.equal(candidates[0].typeCompatibility, "exact");
  assert.deepEqual(
    candidates.map((candidate) => candidate.name),
    ["Quantity", "OrderLineId", "LineText"],
  );
});

test("contract: catalog callable qualified members survive later and nested arguments", () => {
  const secondArgument =
    markedCandidates(`SELECT qpacc.CalculateBillingTotal_Manual(0, ol.|)
FROM qpacc.OrderLines AS ol;`);
  assert.equal(secondArgument[0]?.name, "Quantity");
  assert.ok(secondArgument.every((candidate) => candidate.kind === "column"));
  assert.ok(secondArgument.some((candidate) => candidate.name === "LineText"));

  const nested =
    markedCandidates(`SELECT qpacc.CalculateBillingTotal_Manual(0, qpacc.CalculateBillingTotal_Manual(ol.|, 0.19))
FROM qpacc.OrderLines AS ol;`);
  assert.equal(nested[0]?.name, "Quantity");
  assert.deepEqual(
    nested.map((candidate) => candidate.name),
    ["Quantity", "OrderLineId", "LineText"],
  );
});

test("contract: UPDATE RHS qualifier members retain assignment ExpectedType", () => {
  const candidates = markedCandidates(`UPDATE s
SET ExternalReference = c.|
FROM IntelliSenseLab.qpacc.CompletionLayoutStress AS s
CROSS JOIN IntelliSenseLab.qpacc.Customers AS c;`);
  assert.equal(candidates[0]?.name, "ExternalKey");
  assert.equal(candidates[0].typeCompatibility, "exact");
  assert.deepEqual(candidates[0].keyRoles, ["UQ"]);
  assert.ok(candidates.some((candidate) => candidate.name === "CustomerId"));
  assert.equal(
    candidates.some((candidate) => candidate.name === "ExternalReference"),
    false,
  );
});

test("contract: Smart Alias respects object, whitespace, AS, alias, collision, and database phases", () => {
  const resolve = (sql: string): SmartAliasContext | undefined =>
    resolveSmartAliasContext(
      sql,
      sql.length,
      analyzeDocumentSemantics(sql, sql.length, scope),
      scope,
    );
  assert.equal(resolve("SELECT * FROM qpacc.BelegePositionen"), undefined);
  assert.deepEqual(resolve("SELECT * FROM qpacc.BelegePositionen "), {
    objectName: "BelegePositionen",
    sourceName: "qpacc.BelegePositionen",
    alias: "bp",
    explicitAs: false,
  });
  assert.deepEqual(resolve("SELECT * FROM qpacc.BelegePositionen AS "), {
    objectName: "BelegePositionen",
    sourceName: "qpacc.BelegePositionen",
    alias: "bp",
    explicitAs: true,
  });
  assert.equal(
    resolve("SELECT * FROM qpacc.BelegePositionen AS bp"),
    undefined,
  );
  assert.equal(
    resolve(
      "SELECT * FROM qpacc.Belege AS bpd JOIN qpacc.BelegePositionenDetails ",
    )?.alias,
    "bpd2",
  );
  assert.equal(
    resolve("SELECT * FROM IntelliSenseLab.qpacc.BelegePositionen ")?.alias,
    "bp",
  );
});

test("contract: wildcard expansion is bound to Tab and never Enter", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
    contributes: {
      keybindings?: readonly {
        readonly command?: string;
        readonly key?: string;
      }[];
    };
  };
  const bindings = (manifest.contributes.keybindings ?? []).filter(
    (binding) => binding.command === "queryPuppyForTSql.expandSelectStar",
  );
  assert.deepEqual(
    bindings.map((binding) => binding.key),
    ["tab"],
  );
  assert.equal(
    bindings.some((binding) => binding.key === "enter"),
    false,
  );
});

test("contract: project relationships use one workspace file and native JSON validation", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
    contributes: {
      commands?: readonly { readonly command?: string }[];
      jsonValidation?: readonly {
        readonly fileMatch?: string;
        readonly url?: string;
      }[];
    };
  };
  assert.equal(
    manifest.contributes.commands?.some(
      (command) =>
        command.command === "queryPuppyForTSql.openProjectRelationships",
    ),
    true,
  );
  assert.deepEqual(manifest.contributes.jsonValidation, [
    {
      fileMatch: ".query-puppy/relationships.json",
      url: "./schemas/project-relationships.schema.json",
    },
  ]);
  const schema = JSON.parse(
    await readFile("schemas/project-relationships.schema.json", "utf8"),
  ) as {
    properties?: {
      version?: { const?: number };
      relationships?: {
        items?: {
          properties?: { provenance?: { enum?: readonly string[] } };
        };
      };
    };
  };
  assert.equal(schema.properties?.version?.const, 1);
  assert.deepEqual(
    schema.properties.relationships?.items?.properties?.provenance?.enum,
    ["projectDefined", "userConfirmed"],
  );

  const extensionSource = await readFile("src/extension.ts", "utf8");
  assert.match(extensionSource, /registerCodeActionsProvider/);
  assert.match(extensionSource, /SAVE_JOIN_RELATIONSHIP_COMMAND/);
  const actionSource = await readFile(
    "src/relationships/SqlRelationshipCodeActionProvider.ts",
    "utf8",
  );
  assert.match(actionSource, /Save JOIN as Query Puppy relationship/);
  assert.match(actionSource, /CodeActionKind\.RefactorRewrite/);
});
