import assert from "node:assert/strict";
import test from "node:test";
import {
  formatColumnRoles,
  MAX_VISIBLE_COLUMN_NAME,
  PHYSICAL_COLUMN_ROLE_WIDTH,
  PHYSICAL_COLUMN_TYPE_WIDTH,
  physicalColumnDisplayRow,
  presentationModel,
} from "../src/completion/PresentationModel.js";
import type { CompletionCandidate } from "../src/completion/CompletionCandidate.js";

const sourceObject = {
  id: 1,
  schema: "reltest",
  name: "CompletionLayoutStress",
  normalizedName: "completionlayoutstress",
  kind: "table" as const,
  parameters: [],
  columns: [],
};
const physical = (
  name: string,
  type: NonNullable<CompletionCandidate["sqlType"]>,
  nullable: boolean,
  keyRoles: CompletionCandidate["keyRoles"] = [],
): CompletionCandidate => ({
  name,
  normalizedName: name.toLocaleLowerCase("en-US"),
  kind: "column",
  sqlType: type,
  nullable,
  keyRoles,
  sourceObject,
  physicalColumn: true,
});

test("presentation covers nonphysical columns, callable objects, and mixed descriptions", () => {
  const parameter = {
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
        parameters: [parameter],
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
        parameters: [parameter],
      },
      true,
    ).detail,
    "(@Id int) → table",
  );
});

test("database candidates use their semantic description only in mixed results", () => {
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

test("contract: physical column presentation uses canonical slots and role order", () => {
  assert.equal(MAX_VISIBLE_COLUMN_NAME, 32);
  assert.equal(PHYSICAL_COLUMN_ROLE_WIDTH, 8);
  assert.equal(PHYSICAL_COLUMN_TYPE_WIDTH, 20);
  assert.equal(formatColumnRoles(["FK", "PK", "UQ"]), "PK·UQ·FK");
  const rows = [
    physical("CustomerId", { name: "bigint" }, false, ["PK"]),
    physical("ExternalReference", { name: "uniqueidentifier" }, true, ["UQ"]),
    physical("BillingAddressId", { name: "bigint" }, true, ["FK"]),
    physical("UniqueCustomerId", { name: "bigint" }, false, ["UQ", "FK"]),
  ].map(physicalColumnDisplayRow);
  assert.deepEqual(rows, [
    `${"CustomerId".padEnd(32)}  ${"PK".padEnd(8)}  ${"bigint".padEnd(20)}  NOT NULL`,
    `${"ExternalReference".padEnd(32)}  ${"UQ".padEnd(8)}  ${"uniqueidentifier".padEnd(20)}  NULL`,
    `${"BillingAddressId".padEnd(32)}  ${"FK".padEnd(8)}  ${"bigint".padEnd(20)}  NULL`,
    `${"UniqueCustomerId".padEnd(32)}  ${"UQ·FK".padEnd(8)}  ${"bigint".padEnd(20)}  NOT NULL`,
  ]);
});

test("contract: long physical names are bounded without changing semantic metadata", () => {
  const name = "VeryLongERPBusinessTransactionPostingReferenceIdentifier";
  const candidate = physical(
    name,
    { name: "decimal", precision: 38, scale: 18 },
    true,
  );
  const row = physicalColumnDisplayRow(candidate);
  assert.ok(row);
  assert.equal(row.slice(0, 32), `${name.slice(0, 31)}…`);
  assert.match(row, /decimal\(38,18\)\s+NULL$/);
  assert.equal(candidate.name, name);
});

test("unusual physical datatypes are bounded only in the visible type slot", () => {
  const row = physicalColumnDisplayRow(
    physical("Value", { name: "ExtraordinarilyLongUserTypeName" }, true),
  );
  assert.ok(row);
  const typeStart = 32 + 2 + 8 + 2;
  assert.equal(row.slice(typeStart, typeStart + 20).at(-1), "…");
  assert.match(row, /NULL$/);
});
