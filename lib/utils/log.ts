/**
 * Strips CR/LF from a value before it is interpolated into a log line, so
 * external input (query params, webhook payloads, request bodies) cannot
 * forge additional log entries (CodeQL js/log-injection).
 *
 * Accepts `unknown` because runtime payloads may not match their casts —
 * a non-string value is stringified rather than throwing.
 */
export function sanitizeForLog(value: unknown): string {
  return String(value).replace(/[\r\n]/g, "")
}
