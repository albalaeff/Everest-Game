import accidents from "../../content/facts/accidents.json";
import acclimatization from "../../content/facts/acclimatization.json";
import body from "../../content/facts/body.json";
import cold from "../../content/facts/cold.json";
import crowds from "../../content/facts/crowds.json";
import deaths from "../../content/facts/deaths.json";
import gear from "../../content/facts/gear.json";
import hazards from "../../content/facts/hazards.json";
import medicine from "../../content/facts/medicine.json";
import oxygen from "../../content/facts/oxygen.json";
import route from "../../content/facts/route.json";
import rules from "../../content/facts/rules.json";
import technique from "../../content/facts/technique.json";
import time from "../../content/facts/time.json";
import tours from "../../content/facts/tours.json";
import weather from "../../content/facts/weather.json";
import type { KnowledgeFile } from "./knowledge-base";

/**
 * Every file of content/facts/, for the page and the room server alike, so both hand the rules
 * the same numbers. A Worker has no Vite to find the files by a pattern, so each is named here,
 * and `knowledge-files.test.ts` fails when the folder has one this list doesn't.
 */
export const KNOWLEDGE_FILES: readonly KnowledgeFile[] = [
  accidents,
  acclimatization,
  body,
  cold,
  crowds,
  deaths,
  gear,
  hazards,
  medicine,
  oxygen,
  route,
  rules,
  technique,
  time,
  tours,
  weather,
];
