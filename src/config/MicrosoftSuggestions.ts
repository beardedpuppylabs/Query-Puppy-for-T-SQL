export interface MicrosoftSuggestionInspection {
  readonly effectiveValue: boolean;
  readonly globalValue?: boolean | undefined;
  readonly workspaceValue?: boolean | undefined;
  readonly workspaceFolderValue?: boolean | undefined;
}

export type SuggestionConfigurationScope =
  "global" | "workspace" | "workspaceFolder";

export type QuickInfoConfigurationScope = SuggestionConfigurationScope;

export interface MicrosoftSuggestionState {
  readonly enabled: boolean;
  readonly enablingScope?: SuggestionConfigurationScope;
}

function microsoftOverrideStatusLines(
  inspection: MicrosoftSuggestionInspection,
): readonly string[] {
  if (
    inspection.globalValue === false &&
    inspection.workspaceFolderValue === true
  )
    return ["Global setting: disabled", "Workspace-folder override: enabled"];
  if (inspection.globalValue === false && inspection.workspaceValue === true)
    return ["Global setting: disabled", "Workspace override: enabled"];
  return [];
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
  lines.push(...microsoftOverrideStatusLines(inspection));
  return lines;
}

export function resolveMicrosoftQuickInfoState(
  inspection: MicrosoftSuggestionInspection,
): MicrosoftSuggestionState {
  return resolveMicrosoftSuggestionState(inspection);
}

export function microsoftQuickInfoStatusLines(
  inspection: MicrosoftSuggestionInspection,
): readonly string[] {
  const state = resolveMicrosoftQuickInfoState(inspection);
  if (!state.enabled) return ["Microsoft SQL Quick Info: disabled"];

  const lines = [
    "Microsoft SQL Quick Info: ENABLED",
    "Hover descriptions may be duplicated.",
  ];
  lines.push(...microsoftOverrideStatusLines(inspection));
  return lines;
}

export async function disableMicrosoftQuickInfoAtEffectiveScope(
  inspection: MicrosoftSuggestionInspection,
  update: (scope: QuickInfoConfigurationScope) => Promise<void>,
): Promise<QuickInfoConfigurationScope | undefined> {
  const state = resolveMicrosoftQuickInfoState(inspection);
  if (!state.enabled || !state.enablingScope) return undefined;
  await update(state.enablingScope);
  return state.enablingScope;
}
