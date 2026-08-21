const DAY_MS = 24 * 60 * 60 * 1000;

// Both read `captured`, not `created` - the phone capture time already
// drives every other "time ago" display in the app (InboxRow, ItemDetail),
// so a "new" or "stale" reading here would disagree with the timestamp
// sitting right next to it otherwise.
export function isNewItem(item) {
  return Date.now() - new Date(item.captured).getTime() < DAY_MS;
}

export function isStaleItem(item) {
  return Date.now() - new Date(item.captured).getTime() > 7 * DAY_MS;
}
