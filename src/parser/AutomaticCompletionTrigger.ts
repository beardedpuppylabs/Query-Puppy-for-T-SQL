import { tokenizeSql } from "./SqlTokenizer.js";
import { isPotentialSmartAliasTrigger } from "./SmartAlias.js";
import { resolveRowSourceCompletionPhase } from "./RowSourceCompletionPhase.js";

export type AutomaticCompletionTriggerKind =
  "smartAlias" | "joinContinuation" | "joinOn" | "joinOnContinuation";

export interface AutomaticCompletionEdit {
  readonly rangeOffset: number;
  readonly text: string;
}

export interface PendingCompletionTrigger {
  readonly kind: AutomaticCompletionTriggerKind;
  readonly uri: string;
  readonly documentVersion: number;
  readonly expectedOffset: number;
  readonly generation: number;
}

export function isPotentialJoinOnCompletionTrigger(
  sql: string,
  cursor: number,
): boolean {
  if (!/\s/.test(sql[cursor - 1] ?? "")) return false;
  const tokens = tokenizeSql(sql.slice(0, cursor));
  const last = tokens.at(-1);
  if (
    !last ||
    !["on", "and", "or"].includes(last.normalized) ||
    last.end >= cursor ||
    !/^\s+$/.test(sql.slice(last.end, cursor))
  )
    return false;
  const tokenDepths: number[] = [];
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    tokenDepths[index] = depth;
    if (tokens[index]?.text === "(") depth++;
    else if (tokens[index]?.text === ")") depth = Math.max(0, depth - 1);
  }
  const lastIndex = tokens.length - 1;
  const targetDepth = tokenDepths[lastIndex] ?? 0;
  let foundOn = last.normalized === "on";
  for (let index = lastIndex - 1; index >= 0; index--) {
    if (tokenDepths[index] !== targetDepth) continue;
    const word = tokens[index]?.normalized;
    if (!foundOn && word === "on") foundOn = true;
    if (
      !foundOn &&
      ["where", "having", "group", "order", "union", "join"].includes(
        word ?? "",
      )
    )
      return false;
    if (foundOn && word === "join") return true;
    if (
      foundOn &&
      ["where", "having", "group", "order", "union"].includes(word ?? "")
    )
      return false;
  }
  return false;
}

export function isPotentialJoinContinuationCompletionTrigger(
  sql: string,
  cursor: number,
): boolean {
  const phase = resolveRowSourceCompletionPhase(sql, cursor);
  return Boolean(
    phase?.joinAllowsOn &&
    (phase.kind === "completedObject" || phase.kind === "completedAlias"),
  );
}

export function completionTriggerFromEdit(
  uri: string,
  documentVersion: number,
  sql: string,
  change: AutomaticCompletionEdit,
  generation: number,
  smartAliasesEnabled = true,
): PendingCompletionTrigger | undefined {
  if (!/^\s+$/.test(change.text)) return undefined;
  const expectedOffset = change.rangeOffset + change.text.length;
  const kind =
    smartAliasesEnabled && isPotentialSmartAliasTrigger(sql, expectedOffset)
      ? "smartAlias"
      : isPotentialJoinOnCompletionTrigger(sql, expectedOffset)
        ? tokenizeSql(sql.slice(0, expectedOffset)).at(-1)?.normalized === "on"
          ? "joinOn"
          : "joinOnContinuation"
        : isPotentialJoinContinuationCompletionTrigger(sql, expectedOffset)
          ? "joinContinuation"
          : undefined;
  return kind
    ? { kind, uri, documentVersion, expectedOffset, generation }
    : undefined;
}

export class PendingCompletionTriggerState {
  private generation = 0;
  private pending: PendingCompletionTrigger | undefined;

  replace(
    uri: string,
    documentVersion: number,
    sql: string,
    change: AutomaticCompletionEdit,
    smartAliasesEnabled = true,
  ): PendingCompletionTrigger | undefined {
    this.pending = completionTriggerFromEdit(
      uri,
      documentVersion,
      sql,
      change,
      ++this.generation,
      smartAliasesEnabled,
    );
    return this.pending;
  }

  current(): PendingCompletionTrigger | undefined {
    return this.pending;
  }

  takeIfCurrent(
    uri: string,
    documentVersion: number,
    offset: number,
    generation?: number,
  ): PendingCompletionTrigger | undefined {
    const pending = this.pending;
    if (!pending) return undefined;
    if (
      (generation !== undefined && pending.generation !== generation) ||
      pending.uri !== uri ||
      pending.documentVersion !== documentVersion ||
      pending.expectedOffset !== offset
    )
      return undefined;
    this.pending = undefined;
    return pending;
  }

  clear(): void {
    this.pending = undefined;
  }
}
