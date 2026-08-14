import type {
  ColumnMetadata,
  DatabaseObject,
  ForeignKeyMetadata,
  KeyMetadata,
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
  readonly keyRoles?: readonly ("PK" | "UQ" | "FK")[];
  readonly keys?: readonly KeyMetadata[];
  readonly foreignKeys?: readonly ForeignKeyMetadata[];
  readonly foreignKey?: ForeignKeyMetadata;
  /** Additional normalized text used only for contiguous Contains filtering. */
  readonly searchText?: string;
  readonly relatedRelationshipCount?: number;
  readonly baseObjectName?: string;
  readonly insertText?: string;
  /** Continue schema qualification after this candidate is accepted. */
  readonly triggerSuggest?: boolean;
  /** Request alias completion after a row-source object is accepted. */
  readonly triggerAliasSuggest?: boolean;
  /** Semantic group priority for mixed qualification and row-source domains. */
  readonly priority?: number;
  /** Qualifier that owns a column in the cursor's query scope. */
  readonly sourceQualifier?: string;
  /** True when the semantic origin is an eligible correlated parent scope. */
  readonly outerScope?: boolean;
}
