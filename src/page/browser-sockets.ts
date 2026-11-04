import type { Browser, ClientSocket, SocketEvents } from "./room-client";

/** The browser's WebSocket, as the room client uses it: a message is sent only once it's open. */
class BrowserSocket implements ClientSocket {
  constructor(private readonly socket: WebSocket) {}

  send(text: string): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(text);
    }
  }

  close(): void {
    this.socket.close();
  }

  listen(events: SocketEvents): void {
    this.socket.addEventListener("open", () => {
      events.opened();
    });
    this.socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (typeof event.data === "string") {
        events.heard(event.data);
      }
    });
    this.socket.addEventListener("close", (event) => {
      events.closed(event.code);
    });
  }
}

/** The browser around the room client: its WebSockets and its timers. */
export class BrowserSockets implements Browser {
  constructor(private readonly window: Window) {}

  connect(url: string): ClientSocket {
    return new BrowserSocket(new WebSocket(url));
  }

  after(seconds: number, then: () => void): void {
    this.window.setTimeout(then, seconds * 1000);
  }
}
