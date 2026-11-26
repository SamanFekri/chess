/**
 * Formats a duration as a clock reading.
 *
 * `m:ss` under an hour and `h:mm:ss` beyond it, so the common case stays short.
 * Rounded down: a clock that shows 1:00 the instant it starts would be wrong for
 * the whole first second.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);

  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** The same duration in words, for tooltips and screen readers. */
export function describeDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total} second${total === 1 ? '' : 's'}`;

  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const minutePart = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return seconds === 0
    ? minutePart
    : `${minutePart} ${seconds} second${seconds === 1 ? '' : 's'}`;
}

/**
 * A count-down clock readout.
 *
 * Rounds up, the way a chess clock does: "0:01" is showing for the whole of the
 * last second, and "0:00" appears only when the time is really gone. Under ten
 * seconds it shows tenths, which is when they start to matter.
 */
export function formatCountdown(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < 10_000 && clamped > 0) {
    const tenths = Math.ceil(clamped / 100);
    return `0:0${Math.floor(tenths / 10)}.${tenths % 10}`;
  }
  return formatDuration(Math.ceil(clamped / 1000) * 1000);
}
