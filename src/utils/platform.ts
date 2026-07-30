/**
 * Label for the primary shortcut modifier on this platform: `⌘` on Apple
 * devices, `Ctrl` everywhere else.
 *
 * Used only for display — the handlers accept either modifier regardless, so a
 * wrong guess here mislabels a tooltip and nothing more.
 */
export function modifierKeyLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '⌘' : 'Ctrl';
}
