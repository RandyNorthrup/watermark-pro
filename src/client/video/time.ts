const TIME_DECIMALS = 3

/** Millisecond labels distinguish neighboring timeline keyframes. */
export function videoTimeLabel(time: number): string {
  return `${time.toFixed(TIME_DECIMALS)} s`
}
