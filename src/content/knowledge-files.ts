import acclimatization from "../../content/facts/acclimatization.json";
import crowds from "../../content/facts/crowds.json";
import medicine from "../../content/facts/medicine.json";
import oxygen from "../../content/facts/oxygen.json";
import technique from "../../content/facts/technique.json";
import time from "../../content/facts/time.json";
import weather from "../../content/facts/weather.json";
import type { KnowledgeFile } from "./knowledge-base";

/**
 * Every file of content/facts/, for the page and the room server alike, so both hand the rules
 * the same numbers. A Worker has no Vite to find the files by a pattern, so each is named here,
 * and `knowledge-files.test.ts` fails when the folder has one this list doesn't.
 */
export const KNOWLEDGE_FILES: readonly KnowledgeFile[] = [
  acclimatization,
  crowds,
  medicine,
  oxygen,
  technique,
  time,
  weather,
];
