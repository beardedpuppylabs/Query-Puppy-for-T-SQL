import assert from "node:assert/strict";
import test from "node:test";
import { presentationModel } from "../src/completion/PresentationModel.js";
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
