export type OrderEvent = {
  orderId: string;
  stage: "checkout" | "fulfilled" | "receipt" | "customer_update";
  text: string;
  createdAt: string;
};

const day = 86_400_000;
export function objectKey(event: OrderEvent): string {
  const date = new Date(event.createdAt).toISOString().slice(0, 10);
  return `${event.stage}/${date}/${event.orderId}.json`;
}

export function shouldSweep(key: string, now: Date): boolean {
  const match = /^checkout\/(\d{4}-\d{2}-\d{2})\/[^/]+\.json$/.exec(key);
  if (!match) return false;
  const then = Date.parse(`${match[1]}T00:00:00.000Z`);
  return Number.isFinite(then) && then + 2 * day <= now.getTime();
}
