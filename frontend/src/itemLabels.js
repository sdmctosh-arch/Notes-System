const DAY_MS = 24 * 60 * 60 * 1000;

// Both read `captured`, not `created` - the phone capture time already
// drives every other "time ago" display in the app (InboxRow, ItemDetail),
// so a "new" or "stale" reading here would disagree with the timestamp
// sitting right next to it otherwise.
//
// `days` defaults match the original hardcoded values (1 and 7) and are
// overridden by the Settings page's newDays/staleDays (see settings.js).
export function isNewItem(item, days = 1) {
  return Date.now() - new Date(item.captured).getTime() < days * DAY_MS;
}

export function isStaleItem(item, days = 7) {
  return Date.now() - new Date(item.captured).getTime() > days * DAY_MS;
}

// PROJECT.md 10.4: "the label just stops rendering once the item is filed,
// archived, or dismissed" - shared by every place that shows a New/Stale
// label (InboxRow, ItemDetail) so the rule can't drift between them.
export function isArchivedStatus(item) {
  return ['archived', 'filed', 'dismissed'].includes(item.status);
}
