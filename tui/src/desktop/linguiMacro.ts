/**
 * Runtime stand-in for `@lingui/core/macro`, whose real module throws unless a
 * compiler expands it. Desktop presentation modules only build English source
 * messages here, so each macro returns the interpolated source text.
 */

type Descriptor = { id?: string; message?: string; values?: Record<string, unknown> };
type Choices = Record<string, string>;

function interpolate(strings: TemplateStringsArray, values: readonly unknown[]) {
  return strings.reduce(
    (message, part, index) => message + part + (index < values.length ? String(values[index]) : ""),
    "",
  );
}

function descriptor(input: TemplateStringsArray | Descriptor, values: readonly unknown[]) {
  if (!Array.isArray(input)) return input as Descriptor;
  const message = interpolate(input as TemplateStringsArray, values);
  return { id: message, message };
}

export function msg(input: TemplateStringsArray | Descriptor, ...values: unknown[]) {
  return descriptor(input, values);
}

export const defineMessage = msg;

export function t(input: TemplateStringsArray | Descriptor, ...values: unknown[]) {
  const value = descriptor(input, values);
  return value.message ?? value.id ?? "";
}

export function ph(value: unknown) {
  return value;
}

function choose(value: number, choices: Choices) {
  const form =
    choices[`=${value}`] ?? (value === 1 ? choices.one : undefined) ?? choices.other ?? "";
  return form.replace(/#/gu, String(value));
}

export function plural(value: number, choices: Choices) {
  return choose(value, choices);
}

export const selectOrdinal = plural;

export function select(value: string, choices: Choices) {
  return choices[value] ?? choices.other ?? "";
}
