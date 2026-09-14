'use client';

import { useEffect, useRef } from 'react';

/**
 * What every dialog in the app owes a keyboard.
 *
 * The dialogs were drawn as a panel over a scrim and left at that, which is
 * most of a dialog but not the half that decides whether it can be used
 * without a mouse. Escape did nothing, Tab walked straight out of the panel
 * and on into the page behind it, and whatever was focused before the dialog
 * opened was lost the moment it closed — so someone working by keyboard had
 * to find their place on the page again every time.
 *
 * Four things, all of them the standard behaviour people already expect:
 *
 *   escape      closes, the way clicking the scrim does
 *   focus in    the first thing inside takes focus when it opens
 *   tab trap    Tab and Shift+Tab cycle within the panel
 *   focus back  whatever opened the dialog gets focus again on close
 *
 * Also holds the page behind still. A dialog that scrolls the page under it
 * when you reach the end of its own content reads as the page falling apart,
 * and on a phone it is how you lose the panel off the top of the screen.
 *
 * Give the returned ref to the dialog's outermost element:
 *
 *   const ref = useDialog<HTMLDivElement>(onCancel);
 *   return <div ref={ref} role="dialog" aria-modal="true" …>
 */
export function useDialog<T extends HTMLElement>(onClose?: () => void) {
  const ref = useRef<T>(null);
  /*
   * Kept in a ref so the effect below runs once per dialog rather than on
   * every render. Handlers passed inline are a new function each time, and
   * re-running the effect would pull focus back to the top of the panel
   * mid-typing.
   */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const returnTo = document.activeElement as HTMLElement | null;

    /*
     * Read fresh on each keypress rather than once on open: these dialogs
     * grow and shrink as they are filled in — an error line appears, a
     * category picker opens a second row of buttons — and a list captured on
     * open would send Tab to somewhere that is no longer there.
     */
    const focusable = (): HTMLElement[] =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // The first field, not the panel — a dialog that opens ready to be typed
    // into saves a tab, and says which end of it to start at.
    const first = focusable()[0];
    if (first) first.focus();
    else {
      node.tabIndex = -1;
      node.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current?.();
        return;
      }

      if (e.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;

      // Wrap at each end, and pull focus back in if it has escaped the panel
      // altogether — which is where it starts if the browser put it on the
      // address bar.
      if (e.shiftKey && (active === firstItem || !node.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && (active === lastItem || !node.contains(active))) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    node.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      node.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      /*
       * Only if focus is still inside the dialog that is going away. A dialog
       * that closes because a second one opened over it must not snatch focus
       * out of the one now in front.
       */
      if (returnTo && document.body.contains(returnTo) && node.contains(document.activeElement)) {
        returnTo.focus();
      }
    };
  }, []);

  return ref;
}
