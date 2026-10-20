import {
  cursorSdkParamFamily,
  type CursorSdkModel,
  type CursorSdkModelSelection,
} from "./sdkModels";

/**
 * Decides Max Mode for a model selection against the live account catalog:
 * the flag applies only when the selected context is beyond the model's
 * first, standard window. Since 1.0.38 the public `ModelSelection.maxMode`
 * field carries the decision into the SDK's local RequestedModel; older
 * releases are rejected at load time rather than qualified in place.
 * https://forum.cursor.com/t/grok-4-7-run-rejects-advertised-context-500k/172554/7
 */
export class CursorSdkMaxModeQualification {
  private catalog: readonly CursorSdkModel[] = [];

  get hasCatalog(): boolean {
    return this.catalog.length > 0;
  }

  setCatalog(catalog: readonly CursorSdkModel[]): void {
    this.catalog = catalog;
  }

  needsMaxMode(selection: CursorSdkModelSelection): boolean {
    const model = this.catalog.find(
      (candidate) => candidate.id === selection.id || candidate.aliases?.includes(selection.id),
    );
    return (
      selection.params?.some(({ id, value }) => {
        const context = model?.parameters?.find(
          (definition) => definition.id === id && cursorSdkParamFamily(id) === "context",
        );
        return (
          context !== undefined &&
          context.values[0]?.value !== value &&
          context.values.some((candidate) => candidate.value === value)
        );
      }) === true
    );
  }

  /**
   * The SDK forwards `maxMode` from the public model selection, so
   * qualification decorates it. The field stays absent when the standard
   * window is selected, and an already-qualified selection is unchanged.
   */
  withNativeMaxMode(selection: CursorSdkModelSelection): CursorSdkModelSelection {
    return this.needsMaxMode(selection) ? { ...selection, maxMode: true } : selection;
  }
}
