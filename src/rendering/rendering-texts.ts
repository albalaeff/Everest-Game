/** The rendering's words on the page, in one language of content/rendering.json. */
export type RenderingTexts = Readonly<
  Record<"graphics" | "low" | "medium" | "high" | "fps" | "metres" | "no-webgl", string>
>;
