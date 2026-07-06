const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

/** Length of the longest suffix of `text` that is a proper prefix of `tag`. */
function partialTagSuffix(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length - 1);
  for (let len = max; len > 0; len--) {
    if (text.endsWith(tag.slice(0, len))) return len;
  }
  return 0;
}

/**
 * Streaming filter that removes <think>...</think> blocks emitted by
 * reasoning models (qwen3) so they never reach the UI, even when tags are
 * split across stream chunks.
 */
export function createThinkFilter() {
  let buffer = "";
  let inThink = false;
  let stripLeadingWhitespace = false;

  function emit(text: string): string {
    if (!stripLeadingWhitespace) return text;
    const trimmed = text.replace(/^\s+/, "");
    if (trimmed.length > 0) stripLeadingWhitespace = false;
    return trimmed;
  }

  function process(): string {
    let output = "";
    while (buffer.length > 0) {
      if (inThink) {
        const closeAt = buffer.indexOf(CLOSE_TAG);
        if (closeAt === -1) {
          // Keep only what could be the start of a split closing tag.
          buffer = buffer.slice(buffer.length - partialTagSuffix(buffer, CLOSE_TAG));
          return output;
        }
        buffer = buffer.slice(closeAt + CLOSE_TAG.length);
        inThink = false;
        stripLeadingWhitespace = true;
      } else {
        const openAt = buffer.indexOf(OPEN_TAG);
        if (openAt === -1) {
          const hold = partialTagSuffix(buffer, OPEN_TAG);
          output += emit(buffer.slice(0, buffer.length - hold));
          buffer = buffer.slice(buffer.length - hold);
          return output;
        }
        output += emit(buffer.slice(0, openAt));
        buffer = buffer.slice(openAt + OPEN_TAG.length);
        inThink = true;
      }
    }
    return output;
  }

  return {
    push(chunk: string): string {
      buffer += chunk;
      return process();
    },
    flush(): string {
      const rest = inThink ? "" : emit(buffer);
      buffer = "";
      return rest;
    },
  };
}
