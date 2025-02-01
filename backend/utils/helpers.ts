export function isValidJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeJSONString(str: string): string {
  const trimmed = str.trim();
  if (trimmed.startsWith('{')) {
    let braceCount = 1;
    let index = 1;

    while (braceCount > 0 && index < trimmed.length) {
      if (trimmed[index] === '{') braceCount++;
      if (trimmed[index] === '}') braceCount--;
      index++;
    }

    if (braceCount === 0) {
      return trimmed.substring(0, index);
    }
  }
  return trimmed;
}
