import assert from "node:assert/strict";
import test from "node:test";
import { validateSimpleExecuteResult } from "../src/mssql/SimpleExecuteResult.js";

test("validates the current mssql SimpleExecuteResult cell shape", () => {
  assert.deepEqual(
    validateSimpleExecuteResult({
      rowCount: 1,
      columnInfo: [],
      rows: [[{ displayValue: "IntelliSenseLab", isNull: false }]],
    }),
    {
      rowCount: 1,
      rows: [[{ displayValue: "IntelliSenseLab", isNull: false }]],
    },
  );
});

test("rejects result-shape mismatches instead of silently loading zero objects", () => {
  assert.throws(
    () => validateSimpleExecuteResult({ rowCount: 10, resultSets: [] }),
    /no rows array/,
  );
  assert.throws(
    () => validateSimpleExecuteResult({ rowCount: 10, rows: [] }),
    /reported 10 rows/,
  );
});
