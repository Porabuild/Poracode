import { parse } from "@babel/parser";

export type HeaderFamily = "Modal" | "AlertDialog";
export const headerMarker = {
  Modal: "data-direct-modal-icon",
  AlertDialog: "data-direct-alert-icon",
} as const;

type AstNode = { readonly type: string; readonly [key: string]: unknown };
export interface HeaderSite {
  readonly line: number;
  readonly family: HeaderFamily;
  readonly directIcons: number;
  readonly marked: boolean;
}

function node(value: unknown): AstNode | undefined {
  return value !== null &&
    typeof value === "object" &&
    "type" in value &&
    typeof value.type === "string"
    ? (value as AstNode)
    : undefined;
}

function nodes(value: unknown): AstNode[] {
  return Array.isArray(value) ? value.flatMap((child) => node(child) ?? []) : [];
}

function walk(value: unknown, visit: (value: AstNode, parent?: AstNode) => void, parent?: AstNode) {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit, parent);
    return;
  }
  const current = node(value);
  if (!current) return;
  visit(current, parent);
  for (const child of Object.values(current)) walk(child, visit, current);
}

function name(value: unknown): string {
  const current = node(value);
  if (!current) return "";
  if (current.type === "JSXIdentifier" || current.type === "Identifier") {
    return typeof current.name === "string" ? current.name : "";
  }
  if (current.type === "JSXMemberExpression" || current.type === "MemberExpression") {
    return `${name(current.object)}.${name(current.property)}`;
  }
  return "";
}

function line(value: unknown): number {
  const loc = node(value)?.loc as { start?: { line?: number } } | undefined;
  return loc?.start?.line ?? 0;
}

/** Fail closed when a new producer needs more than the current literal JSX contract. */
export function auditDialogHeaders(source: string) {
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const families = new Map<string, HeaderFamily>();
  const buttons = new Set<string>();
  const issues: string[] = [];
  const sites: HeaderSite[] = [];
  const problem = (current: unknown, message: string) =>
    issues.push(`${line(current)}: ${message}`);

  for (const declaration of ast.program.body) {
    if (declaration.type !== "ImportDeclaration" || declaration.importKind === "type") continue;
    const from = declaration.source.value;
    if (from !== "@heroui/react" && !/(?:^|\/)Button$/.test(from)) continue;
    for (const specifier of declaration.specifiers) {
      if (specifier.type !== "ImportSpecifier") {
        if (from === "@heroui/react") problem(specifier, "audit namespace/default HeroUI access");
        continue;
      }
      if (specifier.importKind === "type") continue;
      const imported =
        specifier.imported.type === "Identifier"
          ? specifier.imported.name
          : specifier.imported.value;
      if (from === "@heroui/react" && (imported === "Modal" || imported === "AlertDialog")) {
        families.set(specifier.local.name, imported);
      }
      if (imported === "Button") buttons.add(specifier.local.name);
    }
  }

  const component = (value: unknown) => {
    const [local, part, extra] = name(value).split(".");
    const family = local ? families.get(local) : undefined;
    return family && part && !extra ? { family, part } : undefined;
  };

  const roots = (children: AstNode[]): AstNode[] =>
    children.flatMap((child) => {
      if (child.type === "JSXFragment") return roots(nodes(child.children));
      if (
        child.type === "JSXText" ||
        (child.type === "JSXExpressionContainer" &&
          node(child.expression)?.type === "JSXEmptyExpression")
      ) {
        return [];
      }
      return [child];
    });

  walk(ast, (current, parent) => {
    // Aliases, re-exports and imperative component access require a separate
    // direct-DOM audit; otherwise they could bypass the JSX producer inventory.
    if (
      current.type === "Identifier" &&
      typeof current.name === "string" &&
      families.has(current.name) &&
      parent?.type !== "ImportSpecifier"
    ) {
      problem(current, "audit non-JSX dialog component access");
    }
    if (current.type !== "JSXElement") return;
    const opening = node(current.openingElement);
    if (!opening) return;
    const attributes = nodes(opening.attributes);
    const owner = component(opening.name);
    const markers = attributes.filter(
      (attribute) =>
        attribute.type === "JSXAttribute" &&
        Object.values(headerMarker).includes(
          name(attribute.name) as (typeof headerMarker)[HeaderFamily],
        ),
    );
    if (owner?.part !== "Header") {
      if (markers.length) problem(current, "marker belongs on its family Header");
      return;
    }
    if (
      attributes.some(
        (attribute) =>
          attribute.type === "JSXSpreadAttribute" ||
          ["children", "render", "as"].includes(name(attribute.name)),
      )
    ) {
      problem(current, "audit Header spread/render/children override");
    }

    let directIcons = 0;
    for (const child of roots(nodes(current.children))) {
      const childOpening = node(child.openingElement);
      if (child.type !== "JSXElement" || !childOpening) {
        problem(child, "audit conditional/expression Header child");
        continue;
      }
      const childName = name(childOpening.name);
      const childComponent = component(childOpening.name);
      const native = /^[a-z][\w-]*$/.test(childName);
      const known =
        native ||
        buttons.has(childName) ||
        childComponent?.part === "Heading" ||
        childComponent?.part === "Icon";
      if (!known) problem(child, "audit custom Header child direct DOM");
      const childAttributes = nodes(childOpening.attributes);
      if (
        childAttributes.some(
          (attribute) =>
            attribute.type === "JSXSpreadAttribute" ||
            ["render", "as"].includes(name(attribute.name)),
        )
      ) {
        problem(child, "audit direct child spread/render override");
      }
      const className = childAttributes.find((attribute) => name(attribute.name) === "className");
      const classValue = node(className?.value);
      if (className && childComponent?.part !== "Icon" && classValue?.type !== "StringLiteral") {
        problem(child, "audit dynamic direct child classes");
      }
      if (
        classValue?.type === "StringLiteral" &&
        typeof classValue.value === "string" &&
        /(?:^|\s)(?:modal|alert-dialog)__(?:header|icon)(?:\s|$)/.test(classValue.value)
      ) {
        problem(child, "audit raw dialog BEM classes");
      }
      if (childComponent?.family === owner.family && childComponent.part === "Icon") directIcons++;
    }
    const expected = headerMarker[owner.family];
    const valid =
      markers.length === 1 &&
      name(markers[0]?.name) === expected &&
      node(markers[0]?.value)?.type === "StringLiteral" &&
      node(markers[0]?.value)?.value === "";
    if ((directIcons > 0 && !valid) || (directIcons === 0 && markers.length > 0)) {
      problem(current, "marker must match an unconditional direct family Icon");
    }
    sites.push({ line: line(current), family: owner.family, directIcons, marked: valid });
  });
  return { sites, issues };
}
