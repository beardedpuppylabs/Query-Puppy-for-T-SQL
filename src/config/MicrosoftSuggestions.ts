export interface MicrosoftSuggestionInspection {
  readonly effectiveValue: boolean;
  readonly globalValue?: boolean | undefined;
  readonly workspaceValue?: boolean | undefined;
  readonly workspaceFolderValue?: boolean | undefined;
}

export type SuggestionConfigurationScope =
  "global" | "workspace" | "workspaceFolder";

export interface MicrosoftSuggestionState {
  readonly enabled: boolean;
  readonly enablingScope?: SuggestionConfigurationScope;
}

export function resolveMicrosoftSuggestionState(
  inspection: MicrosoftSuggestionInspection,
): MicrosoftSuggestionState {
  if (!inspection.effectiveValue) return { enabled: false };
  if (inspection.workspaceFolderValue === true)
    return { enabled: true, enablingScope: "workspaceFolder" };
  if (inspection.workspaceValue === true)
    return { enabled: true, enablingScope: "workspace" };
  return { enabled: true, enablingScope: "global" };
}

export function microsoftSuggestionStatusLines(
  inspection: MicrosoftSuggestionInspection,
): readonly string[] {
  const state = resolveMicrosoftSuggestionState(inspection);
  if (!state.enabled) return ["Microsoft SQL suggestions: disabled"];

  const lines = [
    "Microsoft SQL suggestions: ENABLED",
    "Completion providers may conflict.",
  ];
  if (
    inspection.globalValue === false &&
    inspection.workspaceFolderValue === true
  ) {
    lines.push(
      "Global setting: disabled",
      "Workspace-folder override: enabled",
    );
  } else if (
    inspection.globalValue === false &&
    inspection.workspaceValue === true
  ) {
    lines.push("Global setting: disabled", "Workspace override: enabled");
  }
  return lines;
}
