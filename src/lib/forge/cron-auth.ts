/**
 * Cron auth guard for Forge cron routes.
 *
 * Vercel cron automatically sets the `authorization` header to
 * `Bearer <CRON_SECRET>` if you configure one in project env. Locally
 * or from other callers we fall back to a custom `x-cron-key` header
 * so the route can be triggered manually for testing.
 */
export function isAuthorizedCron(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;

  const xKey = req.headers.get("x-cron-key");
  if (xKey === expected) return true;

  return false;
}
