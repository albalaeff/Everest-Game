/** What the build is told (ci.yml → preview); nothing on a developer's machine. */
interface ImportMetaEnv {
  readonly VITE_COMMIT?: string;
  /** The room server's address, `https://…`; without it, `wrangler dev` on the page's host. */
  readonly VITE_ROOM_SERVER?: string;
}
