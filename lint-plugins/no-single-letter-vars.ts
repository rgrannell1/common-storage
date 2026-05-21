// Lint plugin — enforces that no identifier in a declaration context is a single letter.
// Catches variable declarations, function/arrow parameters, and TypeScript type parameters.
// The bare underscore `_` is exempt as the standard discard convention.

function isSingleLetter(name: string): boolean {
  return name.length === 1 && name !== "_";
}

function reportIfSingleLetter(ctx: Deno.lint.RuleContext, node: Deno.lint.Identifier): void {
  if (isSingleLetter(node.name)) {
    ctx.report({ node, message: `Single-letter identifier '${node.name}' is not allowed — use a descriptive name.` });
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
  },
} satisfies Deno.lint.Plugin;
