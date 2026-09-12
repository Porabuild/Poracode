export type StructuredFormValue = boolean | number | string | string[];
export type StructuredChoice = { const: string; title?: string };
export type StructuredChoiceSource = { oneOf?: StructuredChoice[]; anyOf?: StructuredChoice[] };

export type StructuredFormProperty = StructuredChoiceSource & {
  type: "string" | "integer" | "number" | "boolean" | "array";
  title?: string;
  description?: string;
  default?: StructuredFormValue;
  enum?: string[];
  enumNames?: string[];
  items?: StructuredChoiceSource & { enum?: string[]; enumNames?: string[] };
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  format?: "email" | "uri" | "date" | "date-time";
  placeholder?: string;
  /** Suggested choices may be supplemented with a custom answer. */
  allowCustom?: boolean;
  /** All conditions must match for this field to be displayed and submitted. */
  visibleWhen?: Array<{
    field: string;
    equals?: string | number | boolean;
    notEquals?: string | number | boolean;
  }>;
};

export function structuredFormOptions(
  property: StructuredFormProperty,
): { id: string; label: string }[] {
  const source = property.type === "array" ? property.items : property;
  if (!source) return [];
  const choices = [source.oneOf, source.anyOf].find(Array.isArray) ?? [];
  if (choices.length > 0)
    return choices.map((choice) => ({ id: choice.const, label: choice.title ?? choice.const }));
  return (source.enum ?? []).map((value, index) => ({
    id: value,
    label: source.enumNames?.[index] ?? value,
  }));
}

export function initialStructuredFormValues(
  properties: Record<string, StructuredFormProperty>,
): Record<string, StructuredFormValue> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, property]) => [
      key,
      property.default ??
        (property.type === "boolean" ? false : property.type === "array" ? [] : ""),
    ]),
  );
}

export function structuredFieldVisible(
  property: StructuredFormProperty,
  values: Record<string, StructuredFormValue>,
): boolean {
  return (
    property.visibleWhen?.every((condition) =>
      Object.hasOwn(condition, "equals")
        ? values[condition.field] === condition.equals
        : values[condition.field] !== condition.notEquals,
    ) ?? true
  );
}

export function emptyStructuredValue(value: StructuredFormValue | undefined): boolean {
  return value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
}

export function validStructuredValue(
  property: StructuredFormProperty,
  value: StructuredFormValue | undefined,
  required: boolean,
): boolean {
  if (emptyStructuredValue(value)) return !required;
  if (property.type === "number" || property.type === "integer")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      (property.type !== "integer" || Number.isInteger(value)) &&
      (property.minimum === undefined || value >= property.minimum) &&
      (property.maximum === undefined || value <= property.maximum)
    );
  if (property.type === "boolean") return typeof value === "boolean";
  const choices = structuredFormOptions(property);
  const allowed = (entry: string) =>
    property.allowCustom || choices.length === 0 || choices.some(({ id }) => id === entry);
  if (property.type === "array")
    return (
      Array.isArray(value) &&
      value.every(allowed) &&
      (property.minItems === undefined || value.length >= property.minItems) &&
      (property.maxItems === undefined || value.length <= property.maxItems)
    );
  if (typeof value !== "string" || !allowed(value)) return false;
  if (property.minLength !== undefined && value.length < property.minLength) return false;
  if (property.maxLength !== undefined && value.length > property.maxLength) return false;
  // Provider-supplied patterns are validated by the provider on submission.
  // Executing arbitrary regex here can block the renderer or supervisor.
  if (property.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;
  if (property.format === "uri" && !URL.canParse(value)) return false;
  if (
    (property.format === "date" || property.format === "date-time") &&
    !Number.isFinite(Date.parse(value))
  )
    return false;
  return true;
}
