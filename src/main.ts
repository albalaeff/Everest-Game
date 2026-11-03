import controlTexts from "../content/controls.json";
import disclaimerTexts from "../content/disclaimer.json";
import renderingTexts from "../content/rendering.json";
import { Build } from "./build";
import { Disclaimer } from "./interface/disclaimer";
import { ExpertReview } from "./interface/expert-review";
import { GamePage } from "./page/game-page";
import type { KnowledgeFile } from "./page/knowledge-base";

const facts = Object.values(
  import.meta.glob<KnowledgeFile>("../content/facts/*.json", { eager: true, import: "default" }),
);

document.querySelector("#build")?.append(new Build(import.meta.env.VITE_COMMIT).label());
new Disclaimer(document, disclaimerTexts.en, new ExpertReview(facts)).show(() => {
  const texts = { controls: controlTexts.en, rendering: renderingTexts.en };
  void new GamePage(window, texts, facts).open();
});
