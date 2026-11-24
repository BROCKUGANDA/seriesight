/**
 * Cross-browser MediaQueryList subscription.
 *
 * MediaQueryList.addEventListener is missing in Safari < 14 and some older
 * Android WebViews, which only expose the deprecated addListener/removeListener
 * pair. This helper keeps a single subscription path for all supported browsers.
 */
type LegacyMediaQueryList = MediaQueryList & {
  addListener: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener: (listener: (event: MediaQueryListEvent) => void) => void;
};

export function subscribeToMediaQuery(query: string, listener: () => void): () => void {
  const mql = window.matchMedia(query);

  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }

  const legacy = mql as LegacyMediaQueryList;
  const handler = () => listener();
  legacy.addListener(handler);
  return () => legacy.removeListener(handler);
}
