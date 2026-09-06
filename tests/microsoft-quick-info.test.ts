import assert from "node:assert/strict";
import test from "node:test";
import {
  disableMicrosoftQuickInfoAtEffectiveScope,
  microsoftQuickInfoStatusLines,
  resolveMicrosoftQuickInfoState,
  type QuickInfoConfigurationScope,
} from "../src/config/MicrosoftSuggestions.js";

test("contract: Microsoft Quick Info defaults to an enabled global conflict", () => {
  const inspection = { effectiveValue: true };

  assert.deepEqual(resolveMicrosoftQuickInfoState(inspection), {
    enabled: true,
    enablingScope: "global",
  });
  assert.deepEqual(microsoftQuickInfoStatusLines(inspection), [
    "Microsoft SQL Quick Info: ENABLED",
    "Hover descriptions may be duplicated.",
  ]);
});

test("disabled Microsoft Quick Info has no effective conflict", async () => {
  const writes: QuickInfoConfigurationScope[] = [];
  const inspection = {
    effectiveValue: false,
    globalValue: false,
  };

  assert.deepEqual(resolveMicrosoftQuickInfoState(inspection), {
    enabled: false,
  });
  assert.deepEqual(microsoftQuickInfoStatusLines(inspection), [
    "Microsoft SQL Quick Info: disabled",
  ]);
  assert.equal(
    await disableMicrosoftQuickInfoAtEffectiveScope(
      inspection,
      async (scope) => {
        writes.push(scope);
      },
    ),
    undefined,
  );
  assert.deepEqual(writes, []);
});

test("Microsoft Quick Info workspace override is the disable scope", async () => {
  const writes: QuickInfoConfigurationScope[] = [];
  const inspection = {
    effectiveValue: true,
    globalValue: false,
    workspaceValue: true,
  };

  assert.equal(
    await disableMicrosoftQuickInfoAtEffectiveScope(
      inspection,
      async (scope) => {
        writes.push(scope);
      },
    ),
    "workspace",
  );
  assert.deepEqual(writes, ["workspace"]);
  assert.deepEqual(microsoftQuickInfoStatusLines(inspection), [
    "Microsoft SQL Quick Info: ENABLED",
    "Hover descriptions may be duplicated.",
    "Global setting: disabled",
    "Workspace override: enabled",
  ]);
});

test("Microsoft Quick Info workspace-folder override is the disable scope", async () => {
  const writes: QuickInfoConfigurationScope[] = [];
  const inspection = {
    effectiveValue: true,
    globalValue: false,
    workspaceValue: false,
    workspaceFolderValue: true,
  };

  assert.equal(
    await disableMicrosoftQuickInfoAtEffectiveScope(
      inspection,
      async (scope) => {
        writes.push(scope);
      },
    ),
    "workspaceFolder",
  );
  assert.deepEqual(writes, ["workspaceFolder"]);
  assert.deepEqual(microsoftQuickInfoStatusLines(inspection), [
    "Microsoft SQL Quick Info: ENABLED",
    "Hover descriptions may be duplicated.",
    "Global setting: disabled",
    "Workspace-folder override: enabled",
  ]);
});

test("globally enabled Microsoft Quick Info writes only the global scope", async () => {
  const writes: QuickInfoConfigurationScope[] = [];

  assert.equal(
    await disableMicrosoftQuickInfoAtEffectiveScope(
      { effectiveValue: true, globalValue: true },
      async (scope) => {
        writes.push(scope);
      },
    ),
    "global",
  );
  assert.deepEqual(writes, ["global"]);
});
