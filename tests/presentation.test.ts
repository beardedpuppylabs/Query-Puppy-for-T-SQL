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

test("column presentation appends all key roles after type and nullability", () => {
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
    " int NOT NULL · PK · UQ · FK",
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
  assert.deepEqual(layout, { nameWidth: 16, typeWidth: 13 });
  const details = candidates.map(
    (candidate) => presentationModel(candidate, false, layout).detail,
  );
  assert.deepEqual(details, [
    "        bigint         NOT NULL  PK",
    "  varchar(50)    NULL      FK",
    "             decimal(18,4)  NULL",
  ]);
  const first = details[0];
  const second = details[1];
  const firstCandidate = candidates[0];
  const secondCandidate = candidates[1];
  assert.ok(first && second && firstCandidate && secondCandidate);
  assert.equal(
    firstCandidate.name.length + first.indexOf("bigint"),
    secondCandidate.name.length + second.indexOf("varchar"),
  );
  assert.equal(
    firstCandidate.name.length + first.indexOf("NOT NULL"),
    secondCandidate.name.length + second.indexOf("NULL"),
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
    typeWidth: 13,
  });
});
