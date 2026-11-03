import { describe, expect, it } from "vitest";

import type { KnowledgeFile } from "./knowledge-base";
import { KNOWLEDGE_FILES } from "./knowledge-files";

/** Every file of content/facts/, as Vite finds them: what the list must hold. */
const FOLDER = Object.values(
  import.meta.glob<KnowledgeFile>("../../content/facts/*.json", { eager: true, import: "default" }),
);

describe("KNOWLEDGE_FILES", () => {
  it("names every file of content/facts/, so the room server reads the knowledge base the page does", () => {
    expect(KNOWLEDGE_FILES).toHaveLength(FOLDER.length);
    expect(new Set(KNOWLEDGE_FILES)).toEqual(new Set(FOLDER));
  });
});
