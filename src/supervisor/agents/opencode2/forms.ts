import type { StructuredFormProperty } from "@/shared/structuredForm";
import type { FormInfo } from "./clientTypes";

/** Preserve native form types while using the shared structured-form renderer. */
export function openCode2FormPayload(form: Pick<FormInfo, "title" | "fields">) {
  const properties: Record<string, StructuredFormProperty> = {};
  const required: string[] = [];
  const links: Array<{ url: string; title: string; description?: string }> = [];
  for (const field of form.fields) {
    if (field.type === "external") {
      links.push({
        url: field.url,
        title: field.title ?? field.url,
        ...(field.description ? { description: field.description } : {}),
      });
      continue;
    }
    const property: StructuredFormProperty = {
      type: field.type === "multiselect" ? "array" : field.type,
      ...(field.title ? { title: field.title } : {}),
      ...(field.description ? { description: field.description } : {}),
      ...(field.when
        ? {
            // The beta stream grows freely: drop future/unknown operators
            // instead of inverting the condition into `notEquals`.
            visibleWhen: field.when.flatMap(
              (condition): NonNullable<StructuredFormProperty["visibleWhen"]> =>
                condition.op === "eq"
                  ? [{ field: condition.key, equals: condition.value }]
                  : condition.op === "neq"
                    ? [{ field: condition.key, notEquals: condition.value }]
                    : [],
            ),
          }
        : {}),
    };
    if (field.required !== false) required.push(field.key);
    if (field.type === "number" || field.type === "integer") {
      if (typeof field.minimum === "number" && Number.isFinite(field.minimum))
        property.minimum = field.minimum;
      if (typeof field.maximum === "number" && Number.isFinite(field.maximum))
        property.maximum = field.maximum;
      if (typeof field.default === "number" && Number.isFinite(field.default))
        property.default = field.default;
    } else {
      if (field.default !== undefined) property.default = field.default;
      if (field.type === "string" || field.type === "multiselect") {
        property.allowCustom = field.custom ?? false;
        const choices = field.options?.map((option) => ({
          const: option.value,
          title: option.label,
        }));
        if (field.type === "multiselect") {
          if (choices) property.items = { oneOf: choices };
          if (field.minItems !== undefined) property.minItems = field.minItems;
          if (field.maxItems !== undefined) property.maxItems = field.maxItems;
        } else {
          if (choices) property.oneOf = choices;
          if (field.minLength !== undefined) property.minLength = field.minLength;
          if (field.maxLength !== undefined) property.maxLength = field.maxLength;
          if (field.pattern !== undefined) property.pattern = field.pattern;
          if (field.format !== undefined) property.format = field.format;
          if (field.placeholder !== undefined) property.placeholder = field.placeholder;
        }
      }
    }
    properties[field.key] = property;
  }
  return {
    summary: form.title,
    details: {
      structuredElicitation: {
        mode: "form",
        message: form.title,
        sourceText: "OpenCode 2",
        links,
        requestedSchema: { type: "object", properties, required },
      },
    },
  };
}
