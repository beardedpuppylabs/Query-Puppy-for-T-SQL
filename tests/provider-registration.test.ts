import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPLETION_TRIGGER_CHARACTERS,
  SIGNATURE_HELP_METADATA,
  SQL_DOCUMENT_SELECTOR,
} from "../src/completion/ProviderRegistration.js";

test("contract: completion triggers explicit members and local variables", () => {
  assert.deepEqual(COMPLETION_TRIGGER_CHARACTERS, [".", "@"]);
});

test("contract: native Signature Help triggers calls and retriggers arguments", () => {
  assert.deepEqual(SQL_DOCUMENT_SELECTOR, [
    { language: "sql", scheme: "file" },
    { language: "sql", scheme: "untitled" },
    { language: "sql" },
  ]);
  assert.deepEqual(SIGNATURE_HELP_METADATA.triggerCharacters, ["(", ","]);
  assert.deepEqual(SIGNATURE_HELP_METADATA.retriggerCharacters, [","]);
});
