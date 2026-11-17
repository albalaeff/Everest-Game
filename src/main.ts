import campTexts from "../content/camps.json";
import climberTexts from "../content/climber.json";
import coachTexts from "../content/coach.json";
import debriefTexts from "../content/debrief.json";
import gearTexts from "../content/gear.json";
import godTexts from "../content/god.json";
import menuTexts from "../content/menu.json";
import packTexts from "../content/pack.json";
import controlTexts from "../content/controls.json";
import disclaimerTexts from "../content/disclaimer.json";
import renderingTexts from "../content/rendering.json";
import roomTexts from "../content/room.json";
import sherpaTexts from "../content/sherpa.json";
import { Build } from "./build";
import { KNOWLEDGE_FILES } from "./content/knowledge-files";
import { Disclaimer } from "./interface/disclaimer";
import { ExpertReview } from "./interface/expert-review";
import { Texts } from "./interface/texts";
import { GamePage } from "./page/game-page";

const build = new Build(import.meta.env.VITE_COMMIT);
const facts = KNOWLEDGE_FILES;

document.querySelector("#build")?.append(build.label());
new Disclaimer(document, disclaimerTexts.en, new ExpertReview(facts)).show(() => {
  const texts = {
    controls: controlTexts.en,
    rendering: renderingTexts.en,
    room: new Texts(roomTexts.en),
    menu: new Texts(menuTexts.en),
    camps: new Texts(campTexts.en),
    climber: new Texts(climberTexts.en),
    coach: new Texts(coachTexts.en),
    debrief: new Texts(debriefTexts.en),
    gear: new Texts(gearTexts.en),
    pack: new Texts(packTexts.en),
    sherpa: new Texts(sherpaTexts.en),
    god: new Texts(godTexts.en),
  };
  void new GamePage(window, texts, facts, build).open();
});
