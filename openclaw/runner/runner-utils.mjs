export function extractFirstJson(text) {
  if (!text) return null;
  const source = String(text);
  const startIndexes = [];
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{" || ch === "[") {
      startIndexes.push(i);
    }
  }

  for (const start of startIndexes) {
    const first = source[start];
    const stack = [first === "{" ? "}" : "]"];
    for (let i = start + 1; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "{") stack.push("}");
      if (ch === "[") stack.push("]");
      if (ch === "}" || ch === "]") {
        if (stack.length === 0) break;
        const expected = stack[stack.length - 1];
        if (ch === expected) {
          stack.pop();
          if (stack.length === 0) {
            const snippet = source.slice(start, i + 1);
            try {
              return JSON.parse(snippet);
            } catch {
              break;
            }
          }
        }
      }
    }
  }

  return null;
}

export function splitArgs(input) {
  if (!input) return [];
  const raw = String(input);
  const args = [];
  let buf = "";
  let quote = null;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        buf += ch;
      }
      continue;
    }
    if (ch === "'" || ch === "\"") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (buf) {
        args.push(buf);
        buf = "";
      }
      continue;
    }
    buf += ch;
  }
  if (buf) args.push(buf);
  return args;
}
