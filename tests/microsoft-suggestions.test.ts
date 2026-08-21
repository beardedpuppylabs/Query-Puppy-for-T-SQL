import assert from "node:assert/strict";
import test from "node:test";
import {
  microsoftSuggestionStatusLines,
  resolveMicrosoftSuggestionState,
} from "../src/config/MicrosoftSuggestions.js";

test("contract: Microsoft suggestions first-run setup is explicit and scoped", () => {
  assert.deepEqual(
    resolveMicrosoftSuggestionState({
      effectiveValue: true,
      globalValue: true,
    }),
    { enabled: true, enablingScope: "global" },
  );
});

test("contract: disabled Microsoft suggestions require no first-run mutation", () => {
  assert.deepEqual(
    resolveMicrosoftSuggestionState({
      effectiveValue: false,
      globalValue: false,
    }),
    { enabled: false },
  );
});

test("contract: Microsoft suggestion workspace overrides are identified", () => {
  const inspection = {
    effectiveValue: true,
    globalValue: false,
    workspaceValue: true,
  };
  assert.equal(
    resolveMicrosoftSuggestionState(inspection).enablingScope,
    "workspace",
  );
  assert.deepEqual(microsoftSuggestionStatusLines(inspection), [
    "Microsoft SQL suggestions: ENABLED",
    "Completion providers may conflict.",
    "Global setting: disabled",
    "Workspace override: enabled",
  ]);
});

test("global false and workspace false has no conflict", () => {
  assert.deepEqual(
    resolveMicrosoftSuggestionState({
      effectiveValue: false,
      globalValue: false,
      workspaceValue: false,
    }),
    { enabled: false },
  );
});

test("workspace-folder override is identified as the effective scope", () => {
  const inspection = {
    effectiveValue: true,
    globalValue: false,
    workspaceValue: false,
    workspaceFolderValue: true,
  };
  assert.equal(
    resolveMicrosoftSuggestionState(inspection).enablingScope,
    "workspaceFolder",
  );
  assert.deepEqual(microsoftSuggestionStatusLines(inspection), [
    "Microsoft SQL suggestions: ENABLED",
    "Completion providers may conflict.",
    "Global setting: disabled",
    "Workspace-folder override: enabled",
  ]);
});
