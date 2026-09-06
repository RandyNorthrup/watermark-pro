/** One locale-aware "date and time" formatter shared by every list view. */
export const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})
