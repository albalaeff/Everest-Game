/** Something that holds on to input until its release comes. */
export interface Holding {
  letGo(): void;
}

/** The events of `window` and `document` that end a hold, as far as this class cares. */
export interface PageEvents {
  addEventListener(type: string, listener: (event: Event) => void): void;
}

export interface VisiblePage extends PageEvents {
  readonly hidden: boolean;
}

/**
 * What the input sources share on the page. A call, a locked screen or another window takes the
 * releases away, so all of them let go then, and the climber doesn't walk on alone.
 */
export class InputLayer {
  constructor(
    private readonly holders: readonly Holding[],
    window: PageEvents,
    page: VisiblePage,
  ) {
    window.addEventListener("blur", () => {
      this.letGo();
    });
    window.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
    page.addEventListener("visibilitychange", () => {
      if (page.hidden) {
        this.letGo();
      }
    });
  }

  private letGo(): void {
    for (const holder of this.holders) {
      holder.letGo();
    }
  }
}
