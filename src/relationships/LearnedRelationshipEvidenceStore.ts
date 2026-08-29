import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  applyLearnedRelationshipEvidenceSave,
  LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION,
  parseLearnedRelationshipEvidence,
  serializeLearnedRelationshipEvidence,
  type LearnedRelationshipEvidenceSave,
  type LearnedRelationshipEvidenceRecord,
  type LearnedRelationshipSeenOccurrence,
} from "./LearnedRelationshipEvidence.js";

export type LearnedRelationshipEvidenceStoreResult =
  | {
      readonly kind: "valid";
      readonly evidence: readonly LearnedRelationshipEvidenceRecord[];
      readonly seenOccurrences: readonly LearnedRelationshipSeenOccurrence[];
    }
  | { readonly kind: "invalid"; readonly message: string };

export type LearnedRelationshipEvidenceUpdateResult =
  | { readonly kind: "written"; readonly count: number }
  | { readonly kind: "unchanged"; readonly count: number }
  | { readonly kind: "invalid"; readonly message: string };

interface ValidState {
  readonly kind: "valid";
  readonly evidence: readonly LearnedRelationshipEvidenceRecord[];
  readonly seenOccurrences: readonly LearnedRelationshipSeenOccurrence[];
  readonly requiresRewrite: boolean;
}

interface InvalidState {
  readonly kind: "invalid";
  readonly message: string;
}

type State = ValidState | InvalidState;

/** Atomic, workspace-keyed local persistence for uncertain learned evidence. */
export class FileLearnedRelationshipEvidenceStore {
  private readonly states = new Map<string, State>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly storagePath: string,
    private readonly diagnostic: (message: string) => void = () => undefined,
  ) {}

  read(workspaceKey: string): Promise<LearnedRelationshipEvidenceStoreResult> {
    return this.serialized(workspaceKey, async () => {
      const state = await this.load(workspaceKey);
      return state.kind === "valid"
        ? {
            kind: "valid",
            evidence: state.evidence,
            seenOccurrences: state.seenOccurrences,
          }
        : state;
    });
  }

  update(
    workspaceKey: string,
    save: LearnedRelationshipEvidenceSave,
  ): Promise<LearnedRelationshipEvidenceUpdateResult> {
    return this.serialized(workspaceKey, async () => {
      const state = await this.load(workspaceKey);
      if (state.kind === "invalid") return state;
      const document = applyLearnedRelationshipEvidenceSave(
        {
          version: LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION,
          evidence: state.evidence,
          seenOccurrences: state.seenOccurrences,
        },
        save,
      );
      if (
        !state.requiresRewrite &&
        serializeLearnedRelationshipEvidence(
          document.evidence,
          document.seenOccurrences,
        ) ===
          serializeLearnedRelationshipEvidence(
            state.evidence,
            state.seenOccurrences,
          )
      )
        return { kind: "unchanged", count: document.evidence.length };
      await this.write(
        workspaceKey,
        document.evidence,
        document.seenOccurrences,
      );
      this.states.set(workspaceKey, {
        kind: "valid",
        evidence: document.evidence,
        seenOccurrences: document.seenOccurrences,
        requiresRewrite: false,
      });
      return { kind: "written", count: document.evidence.length };
    });
  }

  clear(workspaceKey: string): Promise<void> {
    return this.serialized(workspaceKey, async () => {
      try {
        await unlink(this.path(workspaceKey));
      } catch (error) {
        if (!isNodeError(error, "ENOENT")) throw error;
      }
      this.states.set(workspaceKey, {
        kind: "valid",
        evidence: [],
        seenOccurrences: [],
        requiresRewrite: false,
      });
    });
  }

  private async load(workspaceKey: string): Promise<State> {
    const cached = this.states.get(workspaceKey);
    if (cached) return cached;
    let text: string;
    try {
      text = await readFile(this.path(workspaceKey), "utf8");
    } catch (error) {
      if (isNodeError(error, "ENOENT")) {
        const empty: ValidState = {
          kind: "valid",
          evidence: [],
          seenOccurrences: [],
          requiresRewrite: false,
        };
        this.states.set(workspaceKey, empty);
        return empty;
      }
      throw error;
    }
    const parsed = parseLearnedRelationshipEvidence(text);
    const state: State =
      parsed.kind === "valid"
        ? {
            kind: "valid",
            evidence: parsed.document.evidence,
            seenOccurrences: parsed.document.seenOccurrences,
            requiresRewrite: parsed.upgradedFromVersion1,
          }
        : parsed;
    this.states.set(workspaceKey, state);
    if (state.kind === "invalid")
      this.diagnostic(
        `Learned relationship evidence for this workspace was ignored: ${state.message}`,
      );
    return state;
  }

  private async write(
    workspaceKey: string,
    evidence: readonly LearnedRelationshipEvidenceRecord[],
    seenOccurrences: readonly LearnedRelationshipSeenOccurrence[],
  ): Promise<void> {
    await mkdir(this.storagePath, { recursive: true });
    const path = this.path(workspaceKey);
    const temporaryPath = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporaryPath, "wx");
      try {
        await handle.writeFile(
          serializeLearnedRelationshipEvidence(evidence, seenOccurrences),
          "utf8",
        );
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporaryPath, path);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  private path(workspaceKey: string): string {
    return join(
      this.storagePath,
      `workspace-${createHash("sha256").update(workspaceKey).digest("hex")}.json`,
    );
  }

  private serialized<T>(
    workspaceKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(workspaceKey) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(workspaceKey, tail);
    void tail.finally(() => {
      if (this.queues.get(workspaceKey) === tail)
        this.queues.delete(workspaceKey);
    });
    return result;
  }
}

const isNodeError = (error: unknown, code: string): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error as NodeJS.ErrnoException).code === code;
