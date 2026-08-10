import assert from "node:assert/strict";
import test from "node:test";
import { containsMatch } from "../src/completion/ContainsMatcher.js";
import { sortCandidates } from "../src/completion/CompletionSorter.js";
import type { CompletionCandidate } from "../src/completion/CompletionCandidate.js";

test("contains matching is contiguous, case-insensitive, and accepts empty search", () => {
  assert.equal(containsMatch("CustomerAddress", "addr"), true);
  assert.equal(containsMatch("CustomerAddress", "ADDR"), true);
  assert.equal(containsMatch("BillingAddress", "address"), true);
  assert.equal(containsMatch("MyCustomer", "customer"), true);
  assert.equal(containsMatch("Customer", "cstmr"), false);
  assert.equal(containsMatch("Customer", ""), true);
});
test("sorting uses exact, type, then alphabetic with no prefix or position bonus", () => {
  const make = (
    name: string,
    kind: CompletionCandidate["kind"],
  ): CompletionCandidate => ({
    name,
    normalizedName: name.toLowerCase(),
    kind,
  });
  const sorted = sortCandidates(
    [
      make("MyCustomer", "table"),
      make("CustomerHistory", "table"),
      make("Customer", "table"),
      make("AlphaCustomer", "view"),
      make("BetaCustomer", "table"),
    ],
    "customer",
    "rowSource",
  );
  assert.deepEqual(
    sorted.map((item) => item.name),
    [
      "Customer",
      "BetaCustomer",
      "CustomerHistory",
      "MyCustomer",
      "AlphaCustomer",
    ],
  );
});
