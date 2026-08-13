export const SQL_DOCUMENT_SELECTOR = [
  { language: "sql", scheme: "file" },
  { language: "sql", scheme: "untitled" },
  { language: "sql" },
] as const;

export const SIGNATURE_HELP_METADATA = {
  triggerCharacters: ["(", ","],
  retriggerCharacters: [","],
} as const;
