import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { prepareFormattingDocument } from "../src/formatting/FormattingPreparation.js";

interface GeneratedCorpus {
  readonly sql: string;
  readonly expectedUnits: number;
}

interface CorpusTier {
  readonly name: string;
  readonly targetBytes: number;
  readonly iterations: number;
  readonly statements: readonly string[];
}

const selectStatement =
  "SELECT a.Id,a.Name FROM dbo.Accounts AS a WHERE a.Id>=@minimum ORDER BY a.Name;\n";
const mixedStatements = [
  selectStatement,
  "UPDATE dbo.Target SET Name=@name OUTPUT inserted.Id WHERE Id=@id;\n",
  "INSERT INTO dbo.Audit(Id,Note) OUTPUT inserted.Id VALUES(@id,N'exact');\n",
  "DELETE FROM dbo.Queue OUTPUT deleted.Id WHERE Id=@id;\n",
] as const;

const tiers: readonly CorpusTier[] = [
  {
    name: "mixed-26kb",
    targetBytes: 26 * 1024,
    iterations: 5,
    statements: mixedStatements,
  },
  {
    name: "select-300kb",
    targetBytes: 300 * 1024,
    iterations: 3,
    statements: [selectStatement],
  },
];

const generateCorpus = (tier: CorpusTier): GeneratedCorpus => {
  let sql = "";
  let expectedUnits = 0;
  while (Buffer.byteLength(sql) < tier.targetBytes) {
    const statement = tier.statements[expectedUnits % tier.statements.length];
    assert.ok(statement);
    sql += statement;
    expectedUnits++;
  }
  return { sql, expectedUnits };
};

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];
  assert.ok(value !== undefined);
  return value;
};

console.log("Query Puppy lossless formatting foundation benchmark");
console.log(`Node ${process.version} on ${process.platform}/${process.arch}`);
console.log(
  "One warm-up per corpus is not recorded; timings have no pass threshold.",
);
console.log("Columns: corpus bytes units tokens median/min/max ms runs ms");

for (const tier of tiers) {
  const corpus = generateCorpus(tier);
  const verify = (): number => {
    const result = prepareFormattingDocument(corpus.sql);
    assert.equal(result.ok, true);
    assert.equal(result.units.length, corpus.expectedUnits);
    assert.equal(result.declined.length, 0);
    assert.equal(result.tokens.map((token) => token.text).join(""), corpus.sql);
    return result.tokens.length;
  };

  verify();
  const timings: number[] = [];
  let tokenCount = 0;
  for (let iteration = 0; iteration < tier.iterations; iteration++) {
    const start = performance.now();
    tokenCount = verify();
    timings.push(performance.now() - start);
  }
  console.log(
    [
      tier.name,
      Buffer.byteLength(corpus.sql),
      corpus.expectedUnits,
      tokenCount,
      median(timings).toFixed(2),
      Math.min(...timings).toFixed(2),
      Math.max(...timings).toFixed(2),
      timings.map((value) => value.toFixed(2)).join(","),
    ].join(" "),
  );
}
