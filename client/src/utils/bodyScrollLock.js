/**
 * Trava o scroll do body com contagem de referências.
 * Evita que modal + lightbox aninhados deixem overflow: hidden preso ao fechar.
 */
let locks = 0;
let previousOverflow = "";

export function lockBodyScroll() {
  if (typeof document === "undefined") {
    return () => {};
  }
  if (locks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  locks += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) {
      document.body.style.overflow = previousOverflow;
      previousOverflow = "";
    }
  };
}
