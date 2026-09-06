import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { documentBatchTokenRanges } from "../src/parser/BatchBoundary.js";
import { collectHighConfidenceDocumentIssues } from "../src/parser/DocumentSemanticDiagnostics.js";
import { tokenizeSql } from "../src/parser/SqlTokenizer.js";
import { documentStatementTokenRanges } from "../src/parser/StatementBoundary.js";

type DiagnosticCode = "QP1001" | "QP1002";

interface Workload {
  readonly id: string;
  readonly description: string;
  readonly generate: (units: number) => GeneratedWorkload;
}

interface GeneratedWorkload {
  readonly sql: string;
  readonly expected: Readonly<Record<DiagnosticCode, number>>;
}

interface SizeTier {
  readonly name: string;
  readonly units: number;
  readonly iterations: number;
}

const sizeTiers: readonly SizeTier[] = [
  { name: "small", units: 25, iterations: 7 },
  { name: "medium", units: 100, iterations: 5 },
  { name: "large", units: 250, iterations: 3 },
];

const ordinaryStatements = (units: number): GeneratedWorkload => ({
  sql: Array.from(
    { length: units },
    (_, index) =>
      `SELECT a${index}.Id, a${index}.DisplayName FROM dbo.Entity${index} AS a${index} WHERE a${index}.Id > ${index};`,
  ).join("\n"),
  expected: { QP1001: 0, QP1002: 0 },
});

const variableBatches = (units: number): GeneratedWorkload => ({
  sql: Array.from({ length: units }, (_, index) =>
    [
      `DECLARE @Value${index} int;`,
      "GO",
      `SELECT @Value${index};`,
      `DECLARE @Value${index} int;`,
      `SELECT @Value${index};`,
      "GO",
    ].join("\n"),
  ).join("\n"),
  expected: { QP1001: units, QP1002: 0 },
});

const nestedAliasStatements = (units: number): GeneratedWorkload => ({
  sql: Array.from({ length: units }, (_, index) =>
    [
      `SELECT o${index}.Id, d${index}.Id, ap${index}.CorrelatedId`,
      `FROM dbo.OuterEntity${index} AS o${index}`,
      "CROSS APPLY (",
      `  SELECT o${index}.Id AS CorrelatedId`,
      `) AS ap${index}`,
      "JOIN (",
      `  SELECT i${index}.Id FROM dbo.InnerEntity${index} AS i${index}`,
      `) AS d${index} ON d${index}.Id = o${index}.Id`,
      "WHERE EXISTS (",
      `  SELECT 1 FROM dbo.ChildEntity${index} AS c${index}`,
      `  WHERE c${index}.ParentId = o${index}.Id`,
      ")",
      "AND EXISTS (",
      `  SELECT 1 FROM dbo.SiblingEntity${index} AS s${index}`,
      `  WHERE i${index}.Id = s${index}.Id`,
      ")",
      "AND EXISTS (",
      `  SELECT 1 FROM dbo.ShadowEntity${index} AS o${index}`,
      `  WHERE o${index}.Id > 0`,
      ")",
      `AND c${index}.Id > 0;`,
    ].join("\n"),
  ).join("\n"),
  expected: { QP1001: 0, QP1002: units * 2 },
});

const mixedScript = (units: number): GeneratedWorkload => {
  const ordinary = ordinaryStatements(units);
  const variables = variableBatches(units);
  const aliases = nestedAliasStatements(units);
  return {
    sql: [ordinary.sql, variables.sql, aliases.sql].join("\n"),
    expected: { QP1001: units, QP1002: units * 2 },
  };
};

const workloads: readonly Workload[] = [
  {
    id: "A",
    description: "ordinary qualified SELECT statements",
    generate: ordinaryStatements,
  },
  {
    id: "B",
    description: "GO batches and local variables",
    generate: variableBatches,
  },
  {
    id: "C",
    description: "nested query scopes and aliases",
    generate: nestedAliasStatements,
  },
  {
    id: "D",
    description: "mixed representative script",
    generate: mixedScript,
  },
];

const diagnosticCounts = (
  sql: string,
): Readonly<Record<DiagnosticCode, number>> => {
  const counts: Record<DiagnosticCode, number> = { QP1001: 0, QP1002: 0 };
  for (const issue of collectHighConfidenceDocumentIssues(sql))
    counts[issue.code]++;
  return counts;
};

const assertExpectedDiagnostics = (
  actual: Readonly<Record<DiagnosticCode, number>>,
  expected: Readonly<Record<DiagnosticCode, number>>,
  label: string,
): void =>
  assert.deepEqual(actual, expected, `${label} fixture semantics changed`);

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  assert.ok(upper !== undefined);
  if (sorted.length % 2 !== 0) return upper;
  const lower = sorted[middle - 1];
  assert.ok(lower !== undefined);
  return (lower + upper) / 2;
};

const formatTiming = (value: number): string => value.toFixed(2);

console.log("Query Puppy document diagnostics benchmark");
console.log(`Node ${process.version} on ${process.platform}/${process.arch}`);
console.log("Warm-up runs per case: 1 (not recorded)");
console.log(
  "Columns: workload tier units chars tokens statements batches diagnostics median/min/max ms runs ms",
);

for (const workload of workloads) {
  console.log(`\n${workload.id}. ${workload.description}`);
  for (const tier of sizeTiers) {
    const generated = workload.generate(tier.units);
    const tokens = tokenizeSql(generated.sql);
    const statements = documentStatementTokenRanges(tokens);
    const batches = documentBatchTokenRanges(tokens);
    const label = `${workload.id}/${tier.name}`;

    assertExpectedDiagnostics(
      diagnosticCounts(generated.sql),
      generated.expected,
      label,
    );

    const timings: number[] = [];
    let lastCounts = generated.expected;
    for (let iteration = 0; iteration < tier.iterations; iteration++) {
      const start = performance.now();
      lastCounts = diagnosticCounts(generated.sql);
      timings.push(performance.now() - start);
    }
    assertExpectedDiagnostics(lastCounts, generated.expected, label);

    const minimum = Math.min(...timings);
    const maximum = Math.max(...timings);
    const diagnosticTotal = lastCounts.QP1001 + lastCounts.QP1002;
    console.log(
      [
        workload.id,
        tier.name,
        tier.units,
        generated.sql.length,
        tokens.length,
        statements.length,
        batches.length,
        `${diagnosticTotal} (QP1001=${lastCounts.QP1001}, QP1002=${lastCounts.QP1002})`,
        `${formatTiming(median(timings))}/${formatTiming(minimum)}/${formatTiming(maximum)}`,
        `[${timings.map(formatTiming).join(", ")}]`,
      ].join(" | "),
    );
  }
}
