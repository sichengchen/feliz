function resolveVar(path: string, context: Record<string, unknown>): string {
  const parts = path.trim().split(".");
  let current: unknown = context;
  for (const part of parts) {
    if (current === null || current === undefined) return "";
    current = (current as Record<string, unknown>)[part];
  }
  if (current === null || current === undefined) return "";
  return String(current);
}

export function renderTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  // Process {% if var %}...{% endif %} blocks
  let result = template.replace(
    /\{%\s*if\s+(\w[\w.]*)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g,
    (_match, varName: string, body: string) => {
      const value = resolveVar(varName, context);
      if (value) return body;
      return "";
    }
  );

  // Process {{ var }} expressions
  result = result.replace(
    /\{\{\s*([\w.]+)\s*\}\}/g,
    (_match, varName: string) => {
      return resolveVar(varName, context);
    }
  );

  return result;
}
