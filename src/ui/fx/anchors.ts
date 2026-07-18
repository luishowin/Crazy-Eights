// Registry of live DOM anchors the FX layer measures at dispatch time.
// Elements register via ref callbacks; rects are read fresh (never cached)
// so flights land correctly after scrolls and resizes.

export type AnchorKey = 'draw' | 'discard' | `seat:${string}` | `hand:${string}`;

const anchors = new Map<AnchorKey, HTMLElement>();

/** Ref callback factory: <div ref={registerAnchor('discard')} />. */
export function registerAnchor(key: AnchorKey): (el: HTMLElement | null) => void {
  return (el) => {
    if (el) anchors.set(key, el);
    else anchors.delete(key);
  };
}

export function rectOf(key: AnchorKey): DOMRect | null {
  const el = anchors.get(key);
  if (!el || !el.isConnected) return null;
  return el.getBoundingClientRect();
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
