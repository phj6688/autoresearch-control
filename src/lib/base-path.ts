/**
 * Base path for client-side fetch/EventSource URLs.
 * Must match basePath in next.config.ts.
 *
 * Next.js only auto-prepends basePath for <Link> and router navigation,
 * NOT for raw fetch() or EventSource().
 */
export const BASE_PATH = "/proxy/autoresearch";

export function apiUrl(path: string): string {
  return `${BASE_PATH}${path}`;
}
