/** What the build is told (ci.yml → preview); nothing on a developer's machine. */
interface ImportMetaEnv {
  readonly VITE_COMMIT?: string;
}
