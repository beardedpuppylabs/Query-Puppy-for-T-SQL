import assert from "node:assert/strict";
import test from "node:test";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { presentationModel } from "../src/completion/PresentationModel.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import type { DatabaseMetadata } from "../src/metadata/MetadataModels.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const column = (name: string, ordinal: number) => ({
  name,
  normalizedName: name.toLowerCase(),
  type: { name: "int" },
  nullable: false,
  ordinal,
});
const metadata: DatabaseMetadata = {
  database: "IntelliSenseLab",
  schemas: ["reltest", "relref"],
  loadedAt: 0,
  objects: [
    {
      id: 1,
      schema: "reltest",
      name: "OrderHeaders",
      normalizedName: "orderheaders",
      kind: "table",
      parameters: [],
      columns: [column("CompanyId", 1), column("OrderId", 2)],
    },
    {
      id: 2,
      schema: "reltest",
      name: "OrderLines",
      normalizedName: "orderlines",
      kind: "table",
      parameters: [],
      columns: [
        column("CompanyId", 1),
        column("OrderId", 2),
        column("LineNo", 3),
      ],
    },
    {
      id: 3,
      schema: "relref",
      name: "Regions",
      normalizedName: "regions",
      kind: "table",
      parameters: [],
      columns: [column("RegionId", 1)],
    },
    {
      id: 4,
      schema: "reltest",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns: [
        column("CustomerId", 1),
        column("RegionId", 2),
        column("AliasCode", 3),
      ],
    },
  ],
  keys: [
    {
      database: "IntelliSenseLab",
      objectId: 1,
      schema: "reltest",
      objectName: "OrderHeaders",
      name: "PK_OrderHeaders",
      kind: "primaryKey",
      filtered: false,
      columns: [
        { columnId: 1, columnName: "CompanyId", ordinal: 1 },
        { columnId: 2, columnName: "OrderId", ordinal: 2 },
      ],
    },
    {
      database: "IntelliSenseLab",
      objectId: 2,
      schema: "reltest",
      objectName: "OrderLines",
      name: "PK_OrderLines",
      kind: "primaryKey",
      filtered: false,
      columns: [
        { columnId: 1, columnName: "CompanyId", ordinal: 1 },
        { columnId: 2, columnName: "OrderId", ordinal: 2 },
        { columnId: 3, columnName: "LineNo", ordinal: 3 },
      ],
    },
    {
      database: "IntelliSenseLab",
      objectId: 4,
      schema: "reltest",
      objectName: "Customers",
      name: "UX_Customers_Alias",
      kind: "uniqueIndex",
      filtered: true,
      filterDefinition: "[AliasCode] IS NOT NULL",
      columns: [{ columnId: 3, columnName: "AliasCode", ordinal: 1 }],
    },
  ],
  foreignKeys: [
    {
      database: "IntelliSenseLab",
      id: 10,
      name: "FK_OrderLines_OrderHeaders",
      parentObjectId: 2,
      parentSchema: "reltest",
      parentObjectName: "OrderLines",
      referencedObjectId: 1,
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
      deleteAction: "CASCADE",
      updateAction: "NO_ACTION",
      disabled: true,
      notTrusted: true,
    },
    {
      database: "IntelliSenseLab",
      id: 11,
      name: "FK_Customers_Regions",
      parentObjectId: 4,
      parentSchema: "reltest",
      parentObjectName: "Customers",
      referencedObjectId: 3,
      referencedSchema: "relref",
      referencedObjectName: "Regions",
      columns: [
        {
          parentColumnId: 2,
          parentColumnName: "RegionId",
          referencedColumnId: 1,
          referencedColumnName: "RegionId",
          ordinal: 1,
        },
      ],
      deleteAction: "NO_ACTION",
      updateAction: "NO_ACTION",
      disabled: false,
      notTrusted: false,
    },
  ],
};

test("contract: relationship graph preserves composite direction state and cross-schema edges", () => {
  const index = new DatabaseIndex(metadata);
  const headers = index.findObject("reltest", "OrderHeaders")!;
  const lines = index.findObject("reltest", "OrderLines")!;
  assert.deepEqual(
    index.keysForObject(headers)[0]?.columns.map((item) => item.columnName),
    ["CompanyId", "OrderId"],
  );
  const relationship = index.relationshipsBetween(headers, lines)[0]!;
  assert.deepEqual(
    relationship.columns.map(
      (item) => `${item.parentColumnName}->${item.referencedColumnName}`,
    ),
    ["CompanyId->CompanyId", "OrderId->OrderId"],
  );
  assert.equal(relationship.disabled, true);
  assert.equal(relationship.notTrusted, true);
  assert.equal(index.outgoingForeignKeys(lines)[0], relationship);
  assert.equal(index.incomingForeignKeys(headers)[0], relationship);
  assert.deepEqual(
    index.relatedObjects(headers).map((item) => item.name),
    ["OrderLines"],
  );
  assert.equal(
    index.outgoingForeignKeys(index.findObject("reltest", "Customers")!)[0]
      ?.referencedSchema,
    "relref",
  );
});

test("contract: physical columns retain combined PK UQ FK roles", () => {
  const index = new DatabaseIndex(metadata);
  const sql = "SELECT ol.company FROM reltest.OrderLines ol";
  const candidates = createCandidates(
    resolveSqlContext(sql, "SELECT ol.company".length),
    index,
  );
  assert.deepEqual(candidates[0]?.keyRoles, ["PK", "FK"]);
  assert.equal(
    presentationModel(candidates[0]!, false).detail,
    " PK·FK int NOT NULL",
  );
  const principalSql = "SELECT oh.company FROM reltest.OrderHeaders oh";
  assert.deepEqual(
    createCandidates(
      resolveSqlContext(principalSql, "SELECT oh.company".length),
      index,
    )[0]?.keyRoles,
    ["PK"],
    "incoming references must not label a principal column as FK",
  );
  const uniqueSql = "SELECT c.alias FROM reltest.Customers c";
  assert.deepEqual(
    createCandidates(
      resolveSqlContext(uniqueSql, "SELECT c.alias".length),
      index,
    )[0]?.keyRoles,
    ["UQ"],
  );
});

test("contract: database indexes retain same-named objects from different schemas", () => {
  const duplicate = new DatabaseIndex({
    database: "Db",
    schemas: ["dbo", "reltest"],
    loadedAt: 0,
    objects: [
      ...metadata.objects,
      {
        id: 50,
        schema: "dbo",
        name: "Addresses",
        normalizedName: "addresses",
        kind: "table",
        parameters: [],
        columns: [],
      },
      {
        id: 51,
        schema: "reltest",
        name: "Addresses",
        normalizedName: "addresses",
        kind: "table",
        parameters: [],
        columns: [],
      },
    ],
  });
  const names = createCandidates(resolveSqlContext("SELECT * FROM Db.addr"), {
    activeDatabase: "Db",
    indexes: new Map([["db", duplicate]]),
  }).map((candidate) => candidate.name);
  assert.ok(names.includes("dbo.Addresses"));
  assert.ok(names.includes("reltest.Addresses"));
});

test("synthetic sources do not inherit catalog key roles", () => {
  const index = new DatabaseIndex(metadata);
  const sql =
    "WITH x AS (SELECT CompanyId FROM reltest.OrderLines) SELECT x.company FROM x";
  assert.equal(
    createCandidates(
      resolveSqlContext(sql, sql.indexOf("x.company") + 9),
      index,
    )[0]?.keyRoles,
    undefined,
  );
});

test("separate indexes keep same-named database objects and relationships isolated", () => {
  const other = new DatabaseIndex({
    ...metadata,
    database: "Other",
    keys: [],
    foreignKeys: [],
  });
  assert.equal(
    other.keysForColumn(other.findObject("reltest", "OrderLines")!, "CompanyId")
      .length,
    0,
  );
});
