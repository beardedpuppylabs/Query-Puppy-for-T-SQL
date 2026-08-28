import assert from "node:assert/strict";
import test from "node:test";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import type {
  DatabaseMetadata,
  ForeignKeyMetadata,
} from "../src/metadata/MetadataModels.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";
import {
  isDeclaredForeignKeyRelationship,
  RelationshipConfidence,
  RelationshipProvenance,
} from "../src/relationships/RelationshipModels.js";

const column = (name: string, ordinal: number) => ({
  name,
  normalizedName: name.toLowerCase(),
  type: { name: "int" },
  nullable: false,
  ordinal,
});
const object = (
  id: number,
  schema: string,
  name: string,
  columns: string[],
) => ({
  id,
  schema,
  name,
  normalizedName: name.toLowerCase(),
  kind: "table" as const,
  parameters: [],
  columns: columns.map(column),
});
const fk = (
  value: Omit<
    ForeignKeyMetadata,
    "database" | "deleteAction" | "updateAction" | "notTrusted"
  >,
): ForeignKeyMetadata => ({
  database: "Db",
  deleteAction: "NO_ACTION",
  updateAction: "NO_ACTION",
  notTrusted: false,
  ...value,
});
const metadata: DatabaseMetadata = {
  database: "Db",
  schemas: ["reltest", "relref"],
  loadedAt: 0,
  objects: [
    object(1, "reltest", "Customers", [
      "CustomerId",
      "BillingAddressId",
      "PrimaryAddressId",
      "ShippingAddressId",
      "RegionId",
    ]),
    object(2, "reltest", "Addresses", ["AddressId", "AlternateAddressId"]),
    object(3, "reltest", "OrderHeaders", [
      "CompanyId",
      "OrderId",
      "CustomerId",
    ]),
    object(4, "reltest", "OrderLines", ["CompanyId", "OrderId"]),
    object(5, "relref", "Regions", ["RegionId"]),
    object(6, "reltest", "Products", ["ProductId"]),
    object(7, "reltest", "CustomerAliases", ["CustomerId"]),
    object(8, "reltest", "LegacyCustomerLinks", ["CustomerId"]),
  ],
  foreignKeys: [
    ...["Billing", "Primary", "Shipping"].map((label, index) =>
      fk({
        id: 10 + index,
        name: `FK_Customers_${label}Address`,
        parentObjectId: 1,
        parentSchema: "reltest",
        parentObjectName: "Customers",
        referencedObjectId: 2,
        referencedSchema: "reltest",
        referencedObjectName: "Addresses",
        columns: [
          {
            parentColumnId: index + 2,
            parentColumnName: `${label}AddressId`,
            referencedColumnId: 1,
            referencedColumnName: "AddressId",
            ordinal: 1,
          },
        ],
        disabled: false,
      }),
    ),
    fk({
      id: 20,
      name: "FK_OrderHeaders_Customers",
      parentObjectId: 3,
      parentSchema: "reltest",
      parentObjectName: "OrderHeaders",
      referencedObjectId: 1,
      referencedSchema: "reltest",
      referencedObjectName: "Customers",
      columns: [
        {
          parentColumnId: 3,
          parentColumnName: "CustomerId",
          referencedColumnId: 1,
          referencedColumnName: "CustomerId",
          ordinal: 1,
        },
      ],
      disabled: false,
    }),
    fk({
      id: 21,
      name: "FK_OrderLines_OrderHeaders",
      parentObjectId: 4,
      parentSchema: "reltest",
      parentObjectName: "OrderLines",
      referencedObjectId: 3,
      referencedSchema: "reltest",
      referencedObjectName: "OrderHeaders",
      columns: [
        {
          parentColumnId: 1,
          parentColumnName: "CompanyId",
          referencedColumnId: 1,
          referencedColumnName: "CompanyId",
          ordinal: 1,
        },
        {
          parentColumnId: 2,
          parentColumnName: "OrderId",
          referencedColumnId: 2,
          referencedColumnName: "OrderId",
          ordinal: 2,
        },
      ],
      disabled: false,
    }),
    fk({
      id: 22,
      name: "FK_Customers_Regions",
      parentObjectId: 1,
      parentSchema: "reltest",
      parentObjectName: "Customers",
      referencedObjectId: 5,
      referencedSchema: "relref",
      referencedObjectName: "Regions",
      columns: [
        {
          parentColumnId: 5,
          parentColumnName: "RegionId",
          referencedColumnId: 1,
          referencedColumnName: "RegionId",
          ordinal: 1,
        },
      ],
      disabled: false,
    }),
    fk({
      id: 23,
      name: "FK_Aliases_Customers",
      parentObjectId: 7,
      parentSchema: "reltest",
      parentObjectName: "CustomerAliases",
      referencedObjectId: 1,
      referencedSchema: "reltest",
      referencedObjectName: "Customers",
      columns: [
        {
          parentColumnId: 1,
          parentColumnName: "CustomerId",
          referencedColumnId: 1,
          referencedColumnName: "CustomerId",
          ordinal: 1,
        },
      ],
      disabled: false,
    }),
    fk({
      id: 24,
      name: "FK_Legacy_Customers",
      parentObjectId: 8,
      parentSchema: "reltest",
      parentObjectName: "LegacyCustomerLinks",
      referencedObjectId: 1,
      referencedSchema: "reltest",
      referencedObjectName: "Customers",
      columns: [
        {
          parentColumnId: 1,
          parentColumnName: "CustomerId",
          referencedColumnId: 1,
          referencedColumnName: "CustomerId",
          ordinal: 1,
        },
      ],
      disabled: true,
    }),
  ],
};
const index = new DatabaseIndex(metadata);
const scope = { activeDatabase: "Db", indexes: new Map([["db", index]]) };
const joins = (sql: string, cursor = sql.length) =>
  createCandidates(resolveSqlContext(sql, cursor), scope).filter(
    (candidate) => candidate.kind === "joinPredicate",
  );
const candidates = (sql: string, cursor = sql.length) =>
  createCandidates(resolveSqlContext(sql, cursor), scope);
const members = (sql: string, cursor = sql.length) =>
  candidates(sql, cursor)
    .filter((candidate) => candidate.kind === "column")
    .map((candidate) => candidate.name);

test("contract: FK JOIN predicates render deterministically in both query orders", () => {
  const forward = joins(
    "SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders oh ON",
  );
  assert.deepEqual(
    forward.map((item) => item.name),
    ["oh.CustomerId = c.CustomerId"],
  );
  const relationship = forward[0]?.relationship;
  assert.ok(relationship);
  assert.ok(isDeclaredForeignKeyRelationship(relationship));
  assert.equal(
    relationship.provenance,
    RelationshipProvenance.DeclaredForeignKey,
  );
  assert.equal(relationship.confidence, RelationshipConfidence.Authoritative);
  assert.deepEqual(
    joins(
      "SELECT * FROM reltest.OrderHeaders oh JOIN reltest.Customers c ON",
    ).map((item) => item.name),
    ["c.CustomerId = oh.CustomerId"],
  );
});

test("JOIN predicates survive existing spaces and newline indentation", () => {
  for (const whitespace of [" ", "     ", "\n        "])
    assert.deepEqual(
      joins(
        `SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders oh ON${whitespace}`,
      ).map((item) => item.name),
      ["oh.CustomerId = c.CustomerId"],
      JSON.stringify(whitespace),
    );
});

test("contract: multiple FK relationships remain distinct", () => {
  assert.deepEqual(
    joins("SELECT * FROM reltest.Customers c JOIN reltest.Addresses a ON")
      .map((item) => item.name)
      .sort(),
    [
      "a.AddressId = c.BillingAddressId",
      "a.AddressId = c.PrimaryAddressId",
      "a.AddressId = c.ShippingAddressId",
    ],
  );
  assert.deepEqual(
    joins("SELECT * FROM reltest.Addresses a JOIN reltest.Customers c ON")
      .map((item) => item.name)
      .sort(),
    [
      "c.BillingAddressId = a.AddressId",
      "c.PrimaryAddressId = a.AddressId",
      "c.ShippingAddressId = a.AddressId",
    ],
  );
});

test("contract: composite FKs produce one ordinal JOIN predicate", () => {
  assert.deepEqual(
    joins(
      "SELECT * FROM reltest.OrderHeaders oh JOIN reltest.OrderLines ol ON",
    ).map((item) => item.name),
    ["ol.CompanyId = oh.CompanyId AND ol.OrderId = oh.OrderId"],
  );
  assert.deepEqual(
    joins(
      "SELECT * FROM reltest.OrderLines ol JOIN reltest.OrderHeaders oh ON",
    ).map((item) => item.name),
    ["oh.CompanyId = ol.CompanyId AND oh.OrderId = ol.OrderId"],
  );
});

test("contract: cross-schema trusted FKs work while disabled FKs do not", () => {
  assert.deepEqual(
    joins("SELECT * FROM reltest.Customers c JOIN relref.Regions r ON").map(
      (item) => item.name,
    ),
    ["r.RegionId = c.RegionId"],
  );
  assert.equal(
    joins("SELECT * FROM reltest.Customers c JOIN reltest.Products p ON")
      .length,
    0,
  );
  assert.equal(
    joins(
      "SELECT * FROM reltest.Customers c JOIN reltest.LegacyCustomerLinks l ON",
    ).length,
    0,
  );
});

test("contract: empty ON without an FK still offers legal semantic expressions only", () => {
  const result = candidates(
    "SELECT * FROM reltest.Customers c JOIN reltest.Products p ON ",
  );
  assert.deepEqual(
    result
      .filter((candidate) => candidate.kind === "joinPredicate")
      .map((candidate) => candidate.name),
    [],
  );
  assert.deepEqual(
    result
      .filter((candidate) => candidate.kind === "rowSourceAlias")
      .map((candidate) => candidate.name),
    ["c", "p"],
  );
  for (const name of ["CustomerId", "ProductId"])
    assert.ok(
      result.some(
        (candidate) => candidate.kind === "column" && candidate.name === name,
      ),
      `missing legal ON column ${name}`,
    );
});

test("contract: empty ON with an FK keeps the real predicate above other semantics", () => {
  assert.deepEqual(
    candidates(
      "SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders oh ON ",
    )
      .slice(0, 1)
      .map((candidate) => candidate.name),
    ["oh.CustomerId = c.CustomerId"],
  );
});

test("relationship matching includes predicate columns and constraint names", () => {
  const base = "SELECT * FROM reltest.Customers c JOIN reltest.Addresses a ON ";
  assert.deepEqual(
    joins(`${base}billing`).map((item) => item.name),
    ["a.AddressId = c.BillingAddressId"],
  );
  assert.deepEqual(
    joins(`${base}primary`).map((item) => item.name),
    ["a.AddressId = c.PrimaryAddressId"],
  );
});

test("only current-right to legally previous sources participates", () => {
  const sql =
    "SELECT * FROM reltest.Customers c JOIN reltest.OrderHeaders oh ON customer JOIN reltest.Addresses future ON";
  const firstCursor = sql.indexOf("customer") + "customer".length;
  assert.deepEqual(
    joins(sql, firstCursor).map((item) => item.name),
    ["oh.CustomerId = c.CustomerId"],
  );
  assert.equal(joins(sql).length, 3);
  const later =
    "SELECT * FROM reltest.Products p JOIN reltest.Customers c ON 1=1 JOIN reltest.CustomerAliases ca ON";
  assert.deepEqual(
    joins(later).map((item) => item.name),
    ["ca.CustomerId = c.CustomerId"],
  );
});

test("contract: relationship ranking occurs after Contains filtering", () => {
  const candidates = createCandidates(
    resolveSqlContext("SELECT * FROM reltest.Customers c JOIN reltest."),
    scope,
  ).filter((candidate) => candidate.kind === "table");
  const names = candidates.map((candidate) => candidate.name);
  for (const related of ["Addresses", "CustomerAliases", "OrderHeaders"])
    assert.ok(names.indexOf(related) < names.indexOf("Products"));
  assert.equal(names.filter((name) => name === "Addresses").length, 1);
  assert.ok(
    names.indexOf("LegacyCustomerLinks") > names.indexOf("OrderHeaders"),
  );
  const contains = createCandidates(
    resolveSqlContext("SELECT * FROM reltest.Customers c JOIN reltest.addr"),
    scope,
  );
  assert.deepEqual(
    contains
      .filter((candidate) => candidate.kind === "table")
      .map((candidate) => candidate.name),
    ["Addresses"],
  );
});

test("contract: real FK metadata breaks comparison type ties", () => {
  assert.deepEqual(
    members(
      "SELECT * FROM reltest.OrderHeaders oh JOIN reltest.Customers c ON oh.CustomerId = c.",
    ).slice(0, 2),
    ["CustomerId", "BillingAddressId"],
  );
  assert.deepEqual(
    members(
      "SELECT * FROM reltest.OrderHeaders oh JOIN reltest.Customers c ON c.CustomerId = oh.",
    ).slice(0, 2),
    ["CustomerId", "CompanyId"],
  );
  const leftMember =
    "SELECT * FROM reltest.OrderHeaders oh JOIN reltest.Customers c ON c. = oh.CustomerId";
  assert.deepEqual(members(leftMember, leftMember.indexOf(" =")).slice(0, 2), [
    "CustomerId",
    "BillingAddressId",
  ]);
  assert.deepEqual(
    members(
      "SELECT * FROM reltest.Customers c JOIN reltest.Addresses a ON c.BillingAddressId = a.",
    ),
    ["AddressId", "AlternateAddressId"],
  );
  assert.deepEqual(
    members(
      "SELECT * FROM reltest.OrderLines ol JOIN reltest.OrderHeaders oh ON ol.OrderId = oh.",
    ).slice(0, 2),
    ["OrderId", "CompanyId"],
  );
  assert.deepEqual(
    members(
      "SELECT * FROM reltest.Products p CROSS JOIN reltest.Customers c WHERE p.ProductId = c.",
    ).slice(0, 2),
    ["BillingAddressId", "CustomerId"],
  );
  assert.deepEqual(
    members(
      "SELECT * FROM reltest.OrderHeaders oh JOIN reltest.Customers c ON oh.CustomerId + 0 = c.",
    ).slice(0, 2),
    ["BillingAddressId", "CustomerId"],
  );
  const ordinary = "SELECT c. FROM reltest.Customers c";
  assert.deepEqual(members(ordinary, ordinary.indexOf(" FROM")).slice(0, 2), [
    "BillingAddressId",
    "CustomerId",
  ]);
});

test("contract: cross-database RowSources never infer FK predicates", () => {
  const other = new DatabaseIndex({
    ...metadata,
    database: "Other",
    foreignKeys: [],
  });
  const crossScope = {
    activeDatabase: "Db",
    indexes: new Map([
      ["db", index],
      ["other", other],
    ]),
  };
  const sql =
    "SELECT * FROM reltest.Customers c JOIN Other.reltest.OrderHeaders oh ON";
  assert.equal(
    createCandidates(resolveSqlContext(sql), crossScope).some(
      (candidate) => candidate.kind === "joinPredicate",
    ),
    false,
  );
});
