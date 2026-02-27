/**
 * Paste support for miniapp webview where e.clipboardData is often empty.
 * Use in onPaste: capture selectionStart/End, then text = await getPasteText(e); if (text) { e.preventDefault(); insert at cursor }.
 * Accepts both DOM ClipboardEvent and React.ClipboardEvent.
 */
type ClipboardEventLike = { clipboardData: DataTransfer | null; preventDefault(): void };

export function getPasteText(e: ClipboardEventLike): Promise<string | null> {
  const sync = e.clipboardData?.getData?.('text/plain');
  if (sync != null && sync !== '') {
    return Promise.resolve(sync);
  }
  e.preventDefault();
  if (typeof navigator?.clipboard?.readText === 'function') {
    return navigator.clipboard.readText().catch(() => null);
  }
  return Promise.resolve(null);
}
