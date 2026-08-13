import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSqlType,
  quoteDatabaseIdentifier,
  quoteIdentifier,
} from "../src/metadata/SqlTypeFormatter.js";
test("formats SQL Server catalog types", () => {
  const cases = [
    [{ name: "int" }, "int"],
    [{ name: "bigint" }, "bigint"],
    [{ name: "varchar", maxLength: 50 }, "varchar(50)"],
    [{ name: "varchar", maxLength: -1 }, "varchar(max)"],
    [{ name: "nvarchar", maxLength: 400 }, "nvarchar(200)"],
    [{ name: "nvarchar", maxLength: -1 }, "nvarchar(max)"],
    [{ name: "decimal", precision: 18, scale: 2 }, "decimal(18,2)"],
    [{ name: "numeric", precision: 9, scale: 4 }, "numeric(9,4)"],
    [{ name: "datetime2", scale: 7 }, "datetime2(7)"],
    [{ name: "time", scale: 3 }, "time(3)"],
    [{ name: "varbinary", maxLength: -1 }, "varbinary(max)"],
    [{ name: "Phone", schema: "types", userDefined: true }, "types.Phone"],
  ] as const;
  for (const [input, expected] of cases)
    assert.equal(formatSqlType(input), expected);
  assert.equal(quoteIdentifier("Order Detail"), "[Order Detail]");
  assert.equal(quoteIdentifier("Customer"), "Customer");
  assert.equal(quoteDatabaseIdentifier("ERP]Lab"), "[ERP]]Lab]");
});

test("preserves valid temporary and variable identifiers", () => {
  assert.equal(quoteIdentifier("#Temp"), "#Temp");
  assert.equal(quoteIdentifier("##GlobalTemp"), "##GlobalTemp");
  assert.equal(quoteIdentifier("@Rows"), "@Rows");
  assert.equal(quoteIdentifier("Address Text"), "[Address Text]");
});
