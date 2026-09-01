export interface SignatureTriggerEdit {
  readonly rangeOffset: number;
  readonly text: string;
}

export interface PendingSignatureTrigger {
  readonly uri: string;
  readonly documentVersion: number;
  readonly expectedOffset: number;
  readonly triggerCharacter: "(" | "," | "procedureArgument";
  readonly generation: number;
  readonly createdAt: number;
}

export function signatureTriggerFromEdit(
  uri: string,
  documentVersion: number,
  change: SignatureTriggerEdit,
  generation: number,
  now = Date.now(),
): PendingSignatureTrigger | undefined {
  if (change.text === ",")
    return {
      uri,
      documentVersion,
      expectedOffset: change.rangeOffset + 1,
      triggerCharacter: ",",
      generation,
      createdAt: now,
    };
  if (change.text === "(" || change.text === "()")
    return {
      uri,
      documentVersion,
      expectedOffset: change.rangeOffset + 1,
      triggerCharacter: "(",
      generation,
      createdAt: now,
    };
  if (/^\s+$/.test(change.text))
    return {
      uri,
      documentVersion,
      expectedOffset: change.rangeOffset + change.text.length,
      triggerCharacter: "procedureArgument",
      generation,
      createdAt: now,
    };
  return undefined;
}

export class PendingSignatureTriggerState {
  private generation = 0;
  private pending: PendingSignatureTrigger | undefined;

  replace(
    uri: string,
    documentVersion: number,
    change: SignatureTriggerEdit,
  ): PendingSignatureTrigger | undefined {
    this.pending = signatureTriggerFromEdit(
      uri,
      documentVersion,
      change,
      ++this.generation,
    );
    return this.pending;
  }

  current(): PendingSignatureTrigger | undefined {
    return this.pending;
  }

  takeIfCurrent(
    uri: string,
    documentVersion: number,
    offset: number,
    generation?: number,
  ): PendingSignatureTrigger | undefined {
    const pending = this.pending;
    if (!pending) return undefined;
    if (generation !== undefined && pending.generation !== generation)
      return undefined;
    if (
      pending.uri !== uri ||
      pending.documentVersion !== documentVersion ||
      pending.expectedOffset !== offset
    ) {
      this.pending = undefined;
      return undefined;
    }
    this.pending = undefined;
    return pending;
  }

  clear(): void {
    this.pending = undefined;
  }
}
