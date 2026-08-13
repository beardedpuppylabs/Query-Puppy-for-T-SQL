import type {
  ColumnMetadata,
  DatabaseObject,
  ParameterMetadata,
  SqlObjectKind,
  SqlType,
} from "../metadata/MetadataModels.js";

export interface CompletionCandidate {
  readonly name: string;
  readonly normalizedName: string;
  readonly kind: SqlObjectKind;
  readonly database?: string;
  readonly schema?: string;
  readonly sqlType?: SqlType;
  readonly nullable?: boolean;
  readonly parameterOutput?: boolean;
  readonly parameters?: readonly ParameterMetadata[];
  readonly returnType?: SqlType;
  readonly sourceObject?: DatabaseObject;
  readonly column?: ColumnMetadata;
  readonly baseObjectName?: string;
  readonly insertText?: string;
  /** Continue schema qualification after this candidate is accepted. */
  readonly triggerSuggest?: boolean;
  /** Semantic group priority for mixed qualification and row-source domains. */
  readonly priority?: number;
}
