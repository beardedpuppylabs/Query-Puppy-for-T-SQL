import assert from "node:assert/strict";
import test from "node:test";
import {
  PendingSignatureTriggerState,
  signatureTriggerFromEdit,
} from "../src/completion/AutomaticSignatureHelp.js";

test("contract: automatic Signature Help recognizes opening closing and comma edits", () => {
  assert.deepEqual(
    signatureTriggerFromEdit(
      "untitled:test",
      2,
      { rangeOffset: 10, text: "(" },
      1,
      5,
    ),
    {
      uri: "untitled:test",
      documentVersion: 2,
      expectedOffset: 11,
      triggerCharacter: "(",
      generation: 1,
      createdAt: 5,
    },
  );
  assert.equal(
    signatureTriggerFromEdit(
      "untitled:test",
      2,
      { rangeOffset: 10, text: "()" },
      1,
    )?.expectedOffset,
    11,
  );
  assert.equal(
    signatureTriggerFromEdit(
      "untitled:test",
      3,
      { rangeOffset: 20, text: "," },
      2,
    )?.expectedOffset,
    21,
  );
  assert.deepEqual(
    signatureTriggerFromEdit(
      "untitled:test",
      4,
      { rangeOffset: 30, text: " " },
      3,
      5,
    ),
    {
      uri: "untitled:test",
      documentVersion: 4,
      expectedOffset: 31,
      triggerCharacter: "procedureArgument",
      generation: 3,
      createdAt: 5,
    },
  );
  assert.equal(
    signatureTriggerFromEdit(
      "untitled:test",
      3,
      { rangeOffset: 20, text: "x" },
      2,
    ),
    undefined,
  );
});

test("contract: automatic Signature Help fulfillment is exact and one-shot", () => {
  const state = new PendingSignatureTriggerState();
  const pending = state.replace("file:test.sql", 4, {
    rangeOffset: 7,
    text: "()",
  });
  assert.ok(pending);
  assert.equal(
    state.takeIfCurrent("file:test.sql", 4, 8)?.generation,
    pending.generation,
  );
  assert.equal(state.takeIfCurrent("file:test.sql", 4, 8), undefined);
});

test("wrong selection, version, document, or generation invalidates pending work", () => {
  const cases: Array<[string, number, number, number | undefined]> = [
    ["file:other.sql", 4, 8, undefined],
    ["file:test.sql", 5, 8, undefined],
    ["file:test.sql", 4, 9, undefined],
  ];
  for (const [uri, version, offset, generation] of cases) {
    const state = new PendingSignatureTriggerState();
    state.replace("file:test.sql", 4, { rangeOffset: 7, text: "(" });
    assert.equal(
      state.takeIfCurrent(uri, version, offset, generation),
      undefined,
    );
    assert.equal(state.current(), undefined);
  }
});

test("a newer edit replaces the previous pending trigger", () => {
  const state = new PendingSignatureTriggerState();
  const first = state.replace("untitled:test", 2, {
    rangeOffset: 10,
    text: "(",
  });
  const second = state.replace("untitled:test", 3, {
    rangeOffset: 14,
    text: ",",
  });
  assert.ok(first && second);
  assert.ok(second.generation > first.generation);
  assert.equal(
    state.takeIfCurrent("untitled:test", 2, 11, first.generation),
    undefined,
  );
  assert.equal(state.current()?.generation, second.generation);
});
