import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";
const type = { name: "int" };
const index = new DatabaseIndex({
  database: "Db",
  schemas: ["dbo", "sales"],
  loadedAt: 0,
  objects: [
    {
      id: 1,
      schema: "dbo",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "CustomerId",
          normalizedName: "customerid",
          type,
          nullable: false,
          ordinal: 1,
        },
        {
          name: "AddressId",
          normalizedName: "addressid",
          type,
          nullable: true,
          ordinal: 2,
        },
        {
          name: "BillingAddressId",
          normalizedName: "billingaddressid",
          type,
          nullable: true,
          ordinal: 3,
        },
        {
          name: "EmailAddress",
          normalizedName: "emailaddress",
          type: { name: "nvarchar", maxLength: 510 },
          nullable: true,
          ordinal: 4,
        },
        {
          name: "ShippingAddressId",
          normalizedName: "shippingaddressid",
          type,
          nullable: true,
          ordinal: 5,
        },
      ],
    },
    {
      id: 2,
      schema: "dbo",
      name: "Addresses",
      normalizedName: "addresses",
      kind: "table",
      parameters: [],
      columns: [],
    },
    {
      id: 3,
      schema: "sales",
      name: "AddressLog",
      normalizedName: "addresslog",
      kind: "view",
      parameters: [],
      columns: [],
    },
    {
      id: 4,
      schema: "dbo",
      name: "GetAddresses",
      normalizedName: "getaddresses",
      kind: "tableValuedFunction",
      parameters: [],
      columns: [],
    },
  ],
});
test("alias completion is columns-only and uses contains", () => {
  const sql = "SELECT c.addr FROM dbo.Customers c";
  const result = createCandidates(
    resolveSqlContext(sql, "SELECT c.addr".length),
    index,
  );
  assert.deepEqual(
    result.map((x) => x.name),
    ["AddressId", "BillingAddressId", "EmailAddress", "ShippingAddressId"],
  );
  assert.equal(
    result.every((x) => x.kind === "column"),
    true,
  );
});
test("schema qualification excludes unrelated schemas", () => {
  const result = createCandidates(
    resolveSqlContext("SELECT * FROM dbo.addr"),
    index,
  );
  assert.deepEqual(
    result.map((x) => x.name),
    ["Addresses", "GetAddresses"],
  );
});

test("an ambiguous unqualified alias source returns no columns", () => {
  const ambiguous = new DatabaseIndex({
    database: "Db",
    schemas: ["dbo", "sales"],
    loadedAt: 0,
    objects: [
      ...index.objects,
      {
        id: 9,
        schema: "sales",
        name: "Customers",
        normalizedName: "customers",
        kind: "table",
        parameters: [],
        columns: [
          {
            name: "WrongColumn",
            normalizedName: "wrongcolumn",
            type,
            nullable: false,
            ordinal: 1,
          },
        ],
      },
    ],
  });
  const sql = "SELECT c.addr FROM Customers c";
  assert.deepEqual(
    createCandidates(resolveSqlContext(sql, "SELECT c.addr".length), ambiguous),
    [],
  );
});
