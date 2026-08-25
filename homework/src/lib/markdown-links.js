// The whole of the link defence for homework text, per `specs/technical-stack.md`:
// there is no content-security policy behind this ("csp" is deliberately null),
// so a link's scheme is checked here before it ever reaches
// `@tauri-apps/plugin-opener`. Pure and tested directly, the same way
// `src/lib/courses.js` holds validation ahead of a write.
export const ALLOWED_LINK_SCHEMES = ["http:", "https:", "mailto:"];

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

export function isAllowedLinkScheme(href) {
  const match = SCHEME.exec(href ?? "");
  if (match === null) {
    return false;
  }
  return ALLOWED_LINK_SCHEMES.includes(match[1].toLowerCase() + ":");
}
