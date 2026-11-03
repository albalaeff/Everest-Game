import controlTexts from "../content/controls.json";
import { Build } from "./build";
import { ControlsPage } from "./input/controls-page";

document.querySelector("#build")?.append(new Build(import.meta.env.VITE_COMMIT).label());
new ControlsPage(window, controlTexts.en);
