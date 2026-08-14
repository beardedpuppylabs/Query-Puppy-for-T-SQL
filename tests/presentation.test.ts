import assert from "node:assert/strict";
import test from "node:test";
import {
  columnPresentationLayout,
  presentationModel,
} from "../src/completion/PresentationModel.js";
import type { CompletionCandidate } from "../src/completion/CompletionCandidate.js";
test("presentation covers columns, scalar/TVF functions, procedures, and mixed descriptions", () => {
  const param = {
    name: "@Id",
    type: { name: "int" },
    output: false,
    ordinal: 1,
  };
  assert.deepEqual(
    presentationModel(
      {
        name: "AddressId",
        normalizedName: "addressid",
        kind: "column",
        sqlType: { name: "int" },
        nullable: false,
      },
      false,
    ),
    { detail: " int NOT NULL" },
  );
  assert.deepEqual(
    presentationModel(
      {
        name: "Name",
        normalizedName: "name",
        kind: "scalarFunction",
        parameters: [param],
        returnType: { name: "nvarchar", maxLength: 400 },
      },
      true,
    ),
    { detail: "(@Id int) → nvarchar(200)", description: "scalar function" },
  );
  assert.equal(
    presentationModel(
      {
        name: "Rows",
        normalizedName: "rows",
        kind: "tableValuedFunction",
        parameters: [param],
      },
      true,
    ).detail,
    "(@Id int) → table",
  );
  assert.equal(
    presentationModel(
      {
        name: "Run",
        normalizedName: "run",
        kind: "procedure",
        parameters: [{ ...param, output: true }],
      },
      true,
    ).detail,
    "(@Id int OUTPUT)",
  );
});

test("database candidates use the database semantic description only in mixed results", () => {
  const database = {
    name: "IntelliSenseLabReporting",
    normalizedName: "intellisenselabreporting",
    kind: "database" as const,
    database: "IntelliSenseLabReporting",
  };
  assert.deepEqual(presentationModel(database, false), { detail: "" });
  assert.deepEqual(presentationModel(database, true), {
    detail: "",
    description: "database",
  });
});

test("column presentation puts compact key roles before type and nullability", () => {
  assert.equal(
    presentationModel(
      {
        name: "CompanyId",
        normalizedName: "companyid",
        kind: "column",
        sqlType: { name: "int" },
        nullable: false,
        keyRoles: ["PK", "UQ", "FK"],
      },
      false,
    ).detail,
    " PK·UQ·FK int NOT NULL",
  );
});

test("physical column sets align bounded type, nullability, and role fields", () => {
  const sourceObject = {
    id: 1,
    schema: "reltest",
    name: "Customers",
    normalizedName: "customers",
    kind: "table" as const,
    parameters: [],
    columns: [],
  };
  const candidates: CompletionCandidate[] = [
    {
      name: "CustomerId",
      normalizedName: "customerid",
      kind: "column",
      sqlType: { name: "bigint" },
      nullable: false,
      keyRoles: ["PK"],
      sourceObject,
    },
    {
      name: "BillingAddressId",
      normalizedName: "billingaddressid",
      kind: "column",
      sqlType: { name: "varchar", maxLength: 50 },
      nullable: true,
      keyRoles: ["FK"],
      sourceObject,
    },
    {
      name: "Total",
      normalizedName: "total",
      kind: "column",
      sqlType: { name: "decimal", precision: 18, scale: 4 },
      nullable: true,
      sourceObject,
    },
  ];
  const layout = columnPresentationLayout(candidates);
  assert.deepEqual(layout, { nameWidth: 16, roleWidth: 2, typeWidth: 13 });
  const details = candidates.map(
    (candidate) => presentationModel(candidate, false, layout).detail,
  );
  assert.deepEqual(details, [
    "        PK  bigint         NOT NULL",
    "  FK  varchar(50)    NULL",
    "                 decimal(18,4)  NULL",
  ]);
  const first = details[0];
  const second = details[1];
  assert.ok(first && second);
  assert.equal(
    candidates[0]!.name.length + first.indexOf("PK"),
    candidates[1]!.name.length + second.indexOf("FK"),
  );
  assert.equal(
    candidates[0]!.name.length + first.indexOf("NOT NULL"),
    candidates[1]!.name.length + second.indexOf("NULL"),
  );
});

test("column alignment caps pathological names and types", () => {
  const sourceObject = {
    schema: "dbo",
    name: "T",
    normalizedName: "t",
    kind: "table" as const,
    parameters: [],
    columns: [],
  };
  const candidates: CompletionCandidate[] = [
    {
      name: "X".repeat(100),
      normalizedName: "x",
      kind: "column",
      sqlType: { name: "nvarchar", maxLength: 400 },
      nullable: true,
      sourceObject,
    },
    {
      name: "Id",
      normalizedName: "id",
      kind: "column",
      sqlType: { name: "int" },
      nullable: false,
      sourceObject,
    },
  ];
  assert.deepEqual(columnPresentationLayout(candidates), {
    nameWidth: 32,
    roleWidth: 0,
    typeWidth: 13,
  });
});

test("roles-first layout keeps complete multi-role metadata near the label", () => {
  const sourceObject = {
    schema: "dbo",
    name: "T",
    normalizedName: "t",
    kind: "table" as const,
    parameters: [],
    columns: [],
  };
  const candidates: CompletionCandidate[] = [
    {
      name: "CompanyId",
      normalizedName: "companyid",
      kind: "column",
      sqlType: { name: "int" },
      nullable: false,
      keyRoles: ["PK", "FK"],
      sourceObject,
    },
    {
      name: "CustomerId",
      normalizedName: "customerid",
      kind: "column",
      sqlType: { name: "bigint" },
      nullable: false,
      keyRoles: ["UQ", "FK"],
      sourceObject,
    },
  ];
  const layout = columnPresentationLayout(candidates);
  const company = candidates[0];
  const customer = candidates[1];
  assert.ok(company && customer);
  assert.deepEqual(layout, { nameWidth: 10, roleWidth: 5, typeWidth: 6 });
  assert.equal(
    presentationModel(company, false, layout).detail,
    "   PK·FK  int     NOT NULL",
  );
  assert.equal(
    presentationModel(customer, false, layout).detail,
    "  UQ·FK  bigint  NOT NULL",
  );
});

test("CompletionLayoutStress keeps complete metadata and bounded name padding", () => {
  const sourceObject = {
    schema: "reltest",
    name: "CompletionLayoutStress",
    normalizedName: "completionlayoutstress",
    kind: "table" as const,
    parameters: [],
    columns: [],
  };
  const specs = [
    ["Amount", { name: "decimal", precision: 38, scale: 18 }, false, []],
    ["BinaryPayload", { name: "varbinary", maxLength: -1 }, true, []],
    ["Code", { name: "varchar", maxLength: 20 }, false, []],
    ["CustomerId", { name: "bigint" }, false, ["FK"]],
    ["DisplayName", { name: "nvarchar", maxLength: 400 }, true, []],
    ["ExternalReference", { name: "uniqueidentifier" }, true, ["UQ"]],
    ["Id", { name: "bigint" }, false, ["PK"]],
    ["OccurredAt", { name: "datetimeoffset", scale: 7 }, false, []],
    ["Payload", { name: "nvarchar", maxLength: -1 }, true, []],
    ["UniqueCustomerId", { name: "bigint" }, false, ["UQ", "FK"]],
    [
      "VeryLongERPBusinessTransactionPostingReferenceIdentifier",
      { name: "nvarchar", maxLength: 200 },
      true,
      [],
    ],
  ] as const;
  const candidates: CompletionCandidate[] = specs.map(
    ([name, sqlType, nullable, keyRoles]) => ({
      name,
      normalizedName: name.toLocaleLowerCase("en-US"),
      kind: "column",
      sqlType,
      nullable,
      keyRoles,
      sourceObject,
    }),
  );
  const layout = columnPresentationLayout(candidates);
  assert.deepEqual(layout, { nameWidth: 32, roleWidth: 5, typeWidth: 17 });
  const rows = candidates.map(
    (candidate) =>
      `${candidate.name}${presentationModel(candidate, false, layout).detail}`,
  );
  for (const value of [
    "decimal(38,18)",
    "varbinary(max)",
    "varchar(20)",
    "nvarchar(200)",
    "uniqueidentifier",
    "bigint",
    "datetimeoffset(7)",
    "nvarchar(max)",
    "PK",
    "FK",
    "UQ",
    "UQ·FK",
    "NULL",
    "NOT NULL",
  ])
    assert.ok(
      rows.some((row) => row.includes(value)),
      `missing ${value}`,
    );
  assert.match(rows[9] ?? "", /UQ·FK\s+bigint\s+NOT NULL$/);
  assert.equal(layout.nameWidth, 32);
});
