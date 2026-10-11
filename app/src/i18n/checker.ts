/**
 * Finds literal user-facing text in a component (PORT_MAP feature B; idea ported from Round 4, made
 * stricter for this line: it also catches strings in ternaries, string tables inside components and
 * props such as `label`). Learning content is data, not code, so it never shows up here.
 */
import ts from 'typescript';

const USER_FACING_ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt', 'aria-description', 'label', 'note']);
/** Attributes whose values are code, not text. */
const CODE_ATTRS = new Set(['class', 'className', 'type', 'key', 'name', 'accept', 'autocomplete', 'autocapitalize', 'inputmode', 'enterkeyhint',
  'role', 'lang', 'href', 'target', 'rel', 'id', 'for', 'style', 'data-g', 'kind', 'value']);
/** Calls whose string arguments are code (selectors, keys, events, table lookups). */
const CODE_CALLS = /^(t|warn|error|log|info|querySelector|querySelectorAll|closest|addEventListener|removeEventListener|getPropertyValue|matchMedia|setItem|getItem|startsWith|includes|split|replace|test|createElement|animate|classList\.\w+|toLocaleDateString|toLocaleString|toLocaleTimeString)$/;

/** CSS values, class lists and identifiers are code. */
const looksLikeCode = (s: string) => /^[a-z0-9]+(\.[A-Za-z0-9_]+)+$/.test(s) || /^\s*[a-zA-Z-]+\(|(translate|rotate|scale|px|ms|deg)/.test(s) || /^[a-z]+[A-Z][A-Za-z]*$/.test(s) || /^[a-z0-9 -]+$/.test(s.trim()) && s.trim().split(/\s+/).every((w) => w.length < 3 || /^[a-z0-9-]+$/.test(w)) && !/[a-z]{3,} [a-z]{3,}/.test(s);
const looksLikeText = (s: string) => /\p{L}/u.test(s) && !looksLikeCode(s) && (/\s/.test(s.trim()) || /\p{Lu}/u.test(s) || /[äöüß]/i.test(s));

export function literalStrings(source: string, file = 'x.tsx'): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const inCodePlace = (n: ts.Node): boolean => {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
      if (ts.isJsxAttribute(p)) return CODE_ATTRS.has(p.name.getText(sf)) || p.name.getText(sf).startsWith('data-');
      if (ts.isCallExpression(p)) {
        const callee = p.expression.getText(sf).split('.').slice(-1)[0]!;
        if (CODE_CALLS.test(callee) || CODE_CALLS.test(p.expression.getText(sf).split('.').slice(-2).join('.'))) return true;
      }
      if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.InKeyword].includes(p.operatorToken.kind)) return true;
      if (ts.isCaseClause(p) && p.expression === n) return true;
      if (ts.isElementAccessExpression(p) && p.argumentExpression === n) return true;
      if (ts.isPropertyAssignment(p) && p.name === n) return true;
      if (ts.isTypeNode(p) || ts.isLiteralTypeNode(p)) return true;
    }
    return false;
  };
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n) && /\p{L}/u.test(n.text)) found.push(n.text.trim());
    if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer)) {
      const name = n.name.getText(sf);
      if (USER_FACING_ATTRS.has(name) && /\p{L}/u.test(n.initializer.text)) found.push(`${name}="${n.initializer.text}"`);
      return; // the literal itself has been judged
    } else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && looksLikeText(n.text) && !inCodePlace(n)) {
      found.push(n.text);
    } else if (ts.isTemplateExpression(n) && !inCodePlace(n)) {
      const parts = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' ');
      if (/\p{L}{2,}/u.test(parts) && looksLikeText(parts)) found.push(parts.trim());
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}
