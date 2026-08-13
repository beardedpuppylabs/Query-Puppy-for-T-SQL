import assert from "node:assert/strict";
import test from "node:test";
import {
  SIGNATURE_HELP_METADATA,
  SQL_DOCUMENT_SELECTOR,
} from "../src/completion/ProviderRegistration.js";

test("SQL signature help registration triggers calls and retriggers arguments", () => {
  assert.deepEqual(SQL_DOCUMENT_SELECTOR, [
    { language: "sql", scheme: "file" },
    { language: "sql", scheme: "untitled" },
    { language: "sql" },
  ]);
  assert.deepEqual(SIGNATURE_HELP_METADATA.triggerCharacters, ["(", ","]);
  assert.deepEqual(SIGNATURE_HELP_METADATA.retriggerCharacters, [","]);
});
