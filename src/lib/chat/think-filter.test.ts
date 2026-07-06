import { describe, expect, it } from "vitest";
import { createThinkFilter } from "./think-filter";

function run(filter: ReturnType<typeof createThinkFilter>, parts: string[]) {
  return parts.map((p) => filter.push(p)).join("") + filter.flush();
}

describe("createThinkFilter", () => {
  it("passes plain text through unchanged", () => {
    const filter = createThinkFilter();
    expect(run(filter, ["Hello ", "world"])).toBe("Hello world");
  });

  it("removes a think block delivered in one piece", () => {
    const filter = createThinkFilter();
    expect(run(filter, ["<think>secret reasoning</think>Answer"])).toBe(
      "Answer"
    );
  });

  it("removes a think block split across many chunks", () => {
    const filter = createThinkFilter();
    expect(
      run(filter, ["<th", "ink>reason", "ing</thi", "nk>An", "swer"])
    ).toBe("Answer");
  });

  it("strips leading whitespace after the think block", () => {
    const filter = createThinkFilter();
    expect(run(filter, ["<think>hmm</think>\n\nAnswer"])).toBe("Answer");
  });

  it("keeps text that merely resembles a tag", () => {
    const filter = createThinkFilter();
    expect(run(filter, ["1 < 2 and 3 > 2"])).toBe("1 < 2 and 3 > 2");
  });
});
