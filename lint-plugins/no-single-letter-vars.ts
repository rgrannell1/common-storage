// Lint plugin — local style rules for Common Storage.
// no-single-letter-vars: no identifier in a declaration context may be a single letter.
//   Catches variable declarations, function/arrow parameters, and TypeScript type parameters.
//   The bare underscore `_` is exempt as the standard discard convention.
// max-line-length: no source line may exceed MAX_LINE_LENGTH characters.

// Maximum allowed characters per source line — discourages overly long lines.
const MAX_LINE_LENGTH = 100;

function isSingleLetter(name: string): boolean {
  return name.length === 1 && name !== "_";
}

// Reports every line in the source that exceeds MAX_LINE_LENGTH characters.
function reportLongLines(ctx: Deno.lint.RuleContext): void {
  const lines = ctx.sourceCode.text.split("\n");
  let offset = 0;
  for (const line of lines) {
    if (line.length > MAX_LINE_LENGTH) {
      ctx.report({
        range: [offset, offset + line.length],
        message: `Line exceeds ${MAX_LINE_LENGTH} characters (${line.length}).`,
      });
    }
    offset += line.length + 1; // +1 for the stripped newline
  }
}

function reportIfSingleLetter(ctx: Deno.lint.RuleContext, node: Deno.lint.Identifier): void {
  if (isSingleLetter(node.name)) {
    const msg = `Single-letter identifier '${node.name}' is not allowed — use a descriptive name.`;
    ctx.report({ node, message: msg });
  }
}

function checkParams(ctx: Deno.lint.RuleContext, params: Deno.lint.Pattern[]): void {
  for (const param of params) {
    if (param.type === "Identifier") reportIfSingleLetter(ctx, param);
  }
}

export default {
  name: "cmstr",
  rules: {
    "no-single-letter-vars": {
      create(ctx: Deno.lint.RuleContext) {
        return {
          VariableDeclarator(node: Deno.lint.VariableDeclarator) {
            if (node.id.type === "Identifier") reportIfSingleLetter(ctx, node.id);
          },
          FunctionDeclaration(node: Deno.lint.FunctionDeclaration) {
            checkParams(ctx, node.params);
          },
          FunctionExpression(node: Deno.lint.FunctionExpression) {
            checkParams(ctx, node.params);
          },
          ArrowFunctionExpression(node: Deno.lint.ArrowFunctionExpression) {
            checkParams(ctx, node.params);
          },
          TSTypeParameter(node: Deno.lint.TSTypeParameter) {
            if (node.name.type === "Identifier") reportIfSingleLetter(ctx, node.name);
          },
        };
      },
    },
    "max-line-length": {
      create(ctx: Deno.lint.RuleContext) {
        return {
          Program() {
            reportLongLines(ctx);
          },
        };
      },
    },
  },
} satisfies Deno.lint.Plugin;
