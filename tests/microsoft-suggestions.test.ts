import assert from "node:assert/strict";
import test from "node:test";
import {
  microsoftSuggestionStatusLines,
  resolveMicrosoftSuggestionState,
} from "../src/config/MicrosoftSuggestions.js";

test("globally enabled Microsoft suggestions are eligible for first-run setup", () => {
  assert.deepEqual(
    resolveMicrosoftSuggestionState({
      effectiveValue: true,
      globalValue: true,
    }),
    { enabled: true, enablingScope: "global" },
  );
});

test("globally disabled Microsoft suggestions need no first-run setup", () => {
  assert.deepEqual(
    resolveMicrosoftSuggestionState({
      effectiveValue: false,
      globalValue: false,
    }),
    { enabled: false },
  );
});

test("workspace override is identified when global suggestions are disabled", () => {
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
