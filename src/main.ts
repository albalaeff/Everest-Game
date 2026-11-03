import controlTexts from "../content/controls.json";
import renderingTexts from "../content/rendering.json";
import { Build } from "./build";
import { GamePage } from "./page/game-page";

document.querySelector("#build")?.append(new Build(import.meta.env.VITE_COMMIT).label());
void new GamePage(window, { controls: controlTexts.en, rendering: renderingTexts.en }).open();
