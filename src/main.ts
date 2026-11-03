import controlTexts from "../content/controls.json";
import disclaimerTexts from "../content/disclaimer.json";
import renderingTexts from "../content/rendering.json";
import { Build } from "./build";
import { Disclaimer } from "./interface/disclaimer";
import { ExpertReview } from "./interface/expert-review";
import type { FactsFile } from "./interface/expert-review";
import { GamePage } from "./page/game-page";

const facts = import.meta.glob<FactsFile>("../content/facts/*.json", {
  eager: true,
  import: "default",
});

document.querySelector("#build")?.append(new Build(import.meta.env.VITE_COMMIT).label());
new Disclaimer(document, disclaimerTexts.en, new ExpertReview(Object.values(facts))).show(() => {
  void new GamePage(window, { controls: controlTexts.en, rendering: renderingTexts.en }).open();
});
