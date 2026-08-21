// Same summary-or-body fallback InboxRow already uses for its preview line -
// share should show the same "gist" of the item, not a full markdown dump.
export function shareTextFor(item) {
  const text = item.enrichment?.summary || item.body || '';
  return {
    title: item.title || item.capture_id,
    text,
    url: item.url || undefined,
  };
}

export function shareTextAsPlainText(item) {
  const { title, text, url } = shareTextFor(item);
  return [title, text, url].filter(Boolean).join('\n\n');
}
