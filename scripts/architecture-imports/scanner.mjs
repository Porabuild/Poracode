/**
 * TypeScript scanner: tokenization and module-reference scanning.
 *
 * Tokenizes source with the TypeScript scanner and finds every module reference
 * kind by token pattern. No regex over raw text; resolution happens in resolver.mjs.
 */
import { extname } from "node:path";
import { createScanner, LanguageVariant, SyntaxKind as K } from "typescript/unstable/ast";
import { JSX_EXTENSIONS } from "./paths.mjs";

function lineStartsOf(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function locationOf(lineStarts, position) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (lineStarts[middle] <= position) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: position - lineStarts[low] + 1 };
}

function literalTokenValue(token) {
  if (token.kind === K.StringLiteral || token.kind === K.NoSubstitutionTemplateLiteral) {
    return token.value;
  }
  return undefined;
}

/**
 * Tokenize a source file with the TypeScript scanner. This is a real tokenizer:
 * comments and strings cannot produce false module ids, and TS/JSX syntax is
 * handled by the compiler's own lexical grammar.
 *
 * Because there is no parser, `/` needs the standard lexer heuristic: a slash
 * that can start an expression is re-scanned as a regular expression so its
 * body cannot yield false module references.
 */
export function tokenizeSource(text, options = {}) {
  const variant = options.jsx ? LanguageVariant.JSX : LanguageVariant.Standard;
  const scanner = createScanner(true, variant, text);
  const lineStarts = lineStartsOf(text);
  const tokens = [];
  const limit = options.tokenLimit ?? 2_000_000;
  let previousStart = -1;
  let previousSignificant;
  const templateDepths = [];
  for (;;) {
    let kind = scanner.scan();
    if (kind === K.EndOfFile) break;
    let start = scanner.getTokenStart();
    if (start === previousStart) {
      // Defensive: a malformed token the scanner cannot make progress on
      // (for example a bare `#` inside a regex character class). Skip one
      // character and keep scanning instead of looping forever.
      scanner.resetTokenState(start + 1);
      previousStart = start + 1;
      continue;
    }
    previousStart = start;
    if (kind === K.SlashToken || kind === K.SlashEqualsToken) {
      if (canStartRegularExpression(previousSignificant)) {
        kind = scanner.reScanSlashToken();
        start = scanner.getTokenStart();
      }
    } else if (kind === K.TemplateHead) {
      templateDepths.push(0);
    } else if (templateDepths.length > 0) {
      const depth = templateDepths[templateDepths.length - 1];
      if (kind === K.OpenBraceToken) {
        templateDepths[templateDepths.length - 1] = depth + 1;
      } else if (kind === K.CloseBraceToken) {
        if (depth === 0) {
          // The parser normally rescans `}` as a template continuation; without
          // it the rest of the template would be scanned as executable code.
          kind = scanner.reScanTemplateToken(false);
          start = scanner.getTokenStart();
          if (kind !== K.TemplateMiddle) templateDepths.pop();
        } else {
          templateDepths[templateDepths.length - 1] = depth - 1;
        }
      }
    }
    if (tokens.length >= limit) throw new Error("Token limit exceeded while scanning source");
    const token = {
      kind,
      text: scanner.getTokenText(),
      value: literalTokenValue({ kind, value: scanner.getTokenValue() }),
      start,
      end: scanner.getTokenEnd(),
      location: locationOf(lineStarts, start),
    };
    tokens.push(token);
    if (token.kind !== K.SlashToken && token.kind !== K.SlashEqualsToken) {
      previousSignificant = token;
    }
  }
  return tokens;
}

const EXPRESSION_ENDING_KINDS = new Set([
  K.Identifier,
  K.PrivateIdentifier,
  K.NumericLiteral,
  K.BigIntLiteral,
  K.StringLiteral,
  K.NoSubstitutionTemplateLiteral,
  K.RegularExpressionLiteral,
  K.TrueKeyword,
  K.FalseKeyword,
  K.NullKeyword,
  K.ThisKeyword,
  K.SuperKeyword,
  K.CloseParenToken,
  K.CloseBracketToken,
  K.CloseBraceToken,
  K.PlusPlusToken,
  K.MinusMinusToken,
  K.TemplateTail,
]);

function canStartRegularExpression(previousSignificant) {
  if (!previousSignificant) return true;
  if (previousSignificant.kind === K.SlashToken) return true;
  return !EXPRESSION_ENDING_KINDS.has(previousSignificant.kind);
}

export function isLiteralLike(token) {
  return (
    token !== undefined &&
    (token.kind === K.StringLiteral || token.kind === K.NoSubstitutionTemplateLiteral)
  );
}

function skipBalanced(tokens, startIndex, openKind, closeKind) {
  let depth = 0;
  for (let index = startIndex; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.kind === openKind) depth++;
    else if (token.kind === closeKind) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return tokens.length - 1;
}

function isInsideWorkerConstructor(tokens, index) {
  let depth = 0;
  for (let cursor = index - 1; cursor >= 0 && index - cursor < 64; cursor--) {
    const token = tokens[cursor];
    if (token.kind === K.CloseParenToken) {
      depth++;
    } else if (token.kind === K.OpenParenToken) {
      if (depth > 0) {
        depth--;
        continue;
      }
      const callee = tokens[cursor - 1];
      const keyword = tokens[cursor - 2];
      if (
        keyword?.kind === K.NewKeyword &&
        callee?.kind === K.Identifier &&
        (callee.text === "Worker" || callee.text === "SharedWorker")
      ) {
        return true;
      }
      return false;
    } else if (
      depth === 0 &&
      (token.kind === K.SemicolonToken || token.kind === K.CloseBraceToken)
    ) {
      return false;
    }
  }
  return false;
}

function classifyTypeOnlyClause(tokens, startIndex, endIndex) {
  // `import { type A, type B }` / `export { type A }` — every element is type-only.
  let elements = 0;
  let typeElements = 0;
  for (let index = startIndex; index < endIndex; index++) {
    const token = tokens[index];
    if (token.kind !== K.OpenBraceToken && token.kind !== K.CommaToken) continue;
    const first = tokens[index + 1];
    if (!first || first.kind === K.CloseBraceToken || index + 1 >= endIndex) continue;
    elements++;
    const second = tokens[index + 2];
    if (
      first.kind === K.TypeKeyword &&
      second &&
      second.kind !== K.CommaToken &&
      second.kind !== K.CloseBraceToken
    ) {
      typeElements++;
    }
  }
  return elements > 0 && elements === typeElements;
}

/**
 * Scan one source file for module references of every kind. The result is
 * independent of any filesystem layout; resolution happens later.
 */
export function scanSourceReferences(text, filePath = "unknown.ts", options = {}) {
  const jsx = options.jsx ?? JSX_EXTENSIONS.has(extname(filePath).toLowerCase());
  const tokens = tokenizeSource(text, { jsx });
  const occurrences = [];

  const add = (entry, literalIndex, computedIndex) => {
    const anchor =
      computedIndex !== undefined ? tokens[computedIndex] : (tokens[literalIndex] ?? tokens[0]);
    const specifier =
      computedIndex === undefined ? (literalTokenValue(tokens[literalIndex] ?? {}) ?? null) : null;
    occurrences.push({
      line: anchor.location.line,
      column: anchor.location.column,
      ...entry,
      typeOnly: entry.typeOnly ?? null,
      specifier,
      computed: computedIndex !== undefined,
      raw:
        computedIndex !== undefined
          ? tokens
              .slice(computedIndex, Math.min(computedIndex + 6, tokens.length))
              .map((token) => token.text)
              .join(" ")
          : (tokens[literalIndex]?.text ?? null),
    });
  };

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const next = tokens[index + 1];

    if (token.kind === K.ImportKeyword) {
      const previous = tokens[index - 1];
      if (previous?.kind === K.DotToken || previous?.kind === K.QuestionDotToken) continue;
      if (next?.kind === K.OpenParenToken) {
        // `import(input: Payload): Result` is a method signature, not a
        // dynamic import. A colon cannot follow the first optional argument of
        // a real `import()` call.
        if (tokens[index + 2]?.kind === K.Identifier && tokens[index + 3]?.kind === K.ColonToken) {
          continue;
        }
        const argument = tokens[index + 2];
        if (isLiteralLike(argument)) add({ kind: "dynamic" }, index + 2);
        else add({ kind: "dynamic" }, 0, index + 2);
        continue;
      }
      if (next?.kind === K.DotToken) {
        // import.meta.glob("...") / import.meta.glob<T>("...")
        if (
          tokens[index + 2]?.kind === K.Identifier &&
          tokens[index + 2].text === "meta" &&
          tokens[index + 3]?.kind === K.DotToken &&
          tokens[index + 4]?.kind === K.Identifier &&
          /^glob(?:Eager)?$/u.test(tokens[index + 4].text)
        ) {
          let cursor = index + 5;
          while (cursor < tokens.length && tokens[cursor].kind !== K.OpenParenToken) {
            if (tokens[cursor].kind === K.SemicolonToken) break;
            cursor++;
          }
          if (tokens[cursor]?.kind === K.OpenParenToken) {
            const argument = tokens[cursor + 1];
            if (isLiteralLike(argument)) add({ kind: "glob" }, cursor + 1);
            else if (argument?.kind === K.OpenBracketToken) {
              for (let item = cursor + 2; item < tokens.length; item++) {
                if (tokens[item].kind === K.CloseBracketToken) break;
                if (isLiteralLike(tokens[item])) add({ kind: "glob" }, item);
              }
            } else {
              add({ kind: "glob" }, 0, cursor + 1);
            }
          }
        }
        continue;
      }
      if (isLiteralLike(next)) {
        add({ kind: "side-effect", typeOnly: false }, index + 1);
        continue;
      }
      // Static `import ... from "..."`.
      let fromIndex = -1;
      let openBraces = 0;
      for (let cursor = index + 1; cursor < tokens.length; cursor++) {
        const candidate = tokens[cursor];
        if (candidate.kind === K.OpenBraceToken) openBraces++;
        else if (candidate.kind === K.CloseBraceToken) openBraces--;
        else if (candidate.kind === K.SemicolonToken && openBraces <= 0) break;
        else if (candidate.kind === K.FromKeyword && openBraces <= 0) {
          fromIndex = cursor;
          break;
        } else if (
          cursor > index + 1 &&
          openBraces <= 0 &&
          (candidate.kind === K.ImportKeyword || candidate.kind === K.ExportKeyword)
        ) {
          break;
        }
      }
      if (fromIndex > 0 && isLiteralLike(tokens[fromIndex + 1])) {
        const clauseIsType =
          next?.kind === K.TypeKeyword && tokens[index + 2]?.kind !== K.FromKeyword;
        let namedTypeOnly = false;
        for (let cursor = index + 1; cursor < fromIndex; cursor++) {
          if (tokens[cursor].kind === K.OpenBraceToken) {
            const closeIndex = skipBalanced(tokens, cursor, K.OpenBraceToken, K.CloseBraceToken);
            namedTypeOnly = classifyTypeOnlyClause(tokens, cursor, closeIndex);
            break;
          }
        }
        add({ kind: "static", typeOnly: clauseIsType || namedTypeOnly }, fromIndex + 1);
      }
      continue;
    }

    if (token.kind === K.ExportKeyword) {
      let cursor = index + 1;
      let typeOnly = false;
      if (tokens[cursor]?.kind === K.TypeKeyword) {
        typeOnly = true;
        cursor++;
      }
      if (tokens[cursor]?.kind === K.AsteriskToken) {
        // export * from "..." / export * as ns from "..."
        let fromIndex = -1;
        for (let probe = cursor + 1; probe < tokens.length; probe++) {
          const candidate = tokens[probe];
          if (candidate.kind === K.FromKeyword) {
            fromIndex = probe;
            break;
          }
          if (candidate.kind === K.SemicolonToken) break;
        }
        if (fromIndex > 0 && isLiteralLike(tokens[fromIndex + 1])) {
          add({ kind: "export-from", typeOnly }, fromIndex + 1);
        }
      } else if (tokens[cursor]?.kind === K.OpenBraceToken) {
        const closeIndex = skipBalanced(tokens, cursor, K.OpenBraceToken, K.CloseBraceToken);
        if (
          tokens[closeIndex + 1]?.kind === K.FromKeyword &&
          isLiteralLike(tokens[closeIndex + 2])
        ) {
          const allTypeOnly = typeOnly || classifyTypeOnlyClause(tokens, cursor, closeIndex);
          add({ kind: "export-from", typeOnly: allTypeOnly }, closeIndex + 2);
        }
      }
      continue;
    }

    if (token.kind === K.RequireKeyword && next?.kind === K.OpenParenToken) {
      const previous = tokens[index - 1];
      if (previous?.kind === K.DotToken || previous?.kind === K.QuestionDotToken) continue;
      const beforePrevious = tokens[index - 2];
      const importEquals =
        previous?.text === "=" &&
        beforePrevious?.kind === K.Identifier &&
        tokens[index - 3]?.kind === K.ImportKeyword;
      const kind = importEquals ? "import-equals" : "require";
      const argument = tokens[index + 2];
      if (isLiteralLike(argument)) add({ kind, typeOnly: false }, index + 2);
      else add({ kind, typeOnly: false }, 0, index + 2);
      continue;
    }

    if (token.kind === K.NewKeyword && next?.kind === K.Identifier && next.text === "URL") {
      const argument = tokens[index + 3];
      if (
        tokens[index + 2]?.kind === K.OpenParenToken &&
        isLiteralLike(argument) &&
        tokens[index + 4]?.kind === K.CommaToken &&
        tokens[index + 5]?.kind === K.ImportKeyword &&
        tokens[index + 6]?.kind === K.DotToken &&
        tokens[index + 7]?.kind === K.Identifier &&
        tokens[index + 7].text === "meta" &&
        tokens[index + 8]?.kind === K.DotToken &&
        tokens[index + 9]?.kind === K.Identifier &&
        tokens[index + 9].text === "url"
      ) {
        add(
          {
            kind: "url-asset",
            typeOnly: false,
            worker: isInsideWorkerConstructor(tokens, index),
          },
          index + 3,
        );
      }
      continue;
    }

    if (
      token.kind === K.Identifier &&
      (token.text === "vi" || token.text === "jest") &&
      next?.kind === K.DotToken &&
      tokens[index + 2]?.kind === K.Identifier &&
      /^(?:mock|doMock|unmock|importActual|importMock)$/u.test(tokens[index + 2].text) &&
      tokens[index + 3]?.kind === K.OpenParenToken &&
      isLiteralLike(tokens[index + 4])
    ) {
      add({ kind: "test-mock", typeOnly: false }, index + 4);
    }
  }

  return occurrences;
}
