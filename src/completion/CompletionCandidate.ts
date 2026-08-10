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
  readonly schema?: string;
  readonly sqlType?: SqlType;
  readonly nullable?: boolean;
  readonly parameters?: readonly ParameterMetadata[];
  readonly returnType?: SqlType;
  readonly sourceObject?: DatabaseObject;
  readonly column?: ColumnMetadata;
  readonly baseObjectName?: string;
}
