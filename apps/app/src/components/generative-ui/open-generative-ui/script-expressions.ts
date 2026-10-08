/** Accept classic expression completion values and async function-body syntax. */
export function expressionInvocation(code: string): string {
  const literal = JSON.stringify(code);
  if (/^\s*(?:return\b|await\b)/.test(code)) {
    return `(new (Object.getPrototypeOf(async function(){}).constructor)(${literal}))()`;
  }
  return `(0, eval)(${literal})`;
}
