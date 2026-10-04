import { createServer } from "node:http";
import { z } from "zod";
import { infrai, InfraiError } from "./infrai.ts";
import { objectKey, shouldSweep } from "./retention.ts";

const bucket = process.env.INFRAI_BUCKET ?? "creator-checkout-temporary";
const eventSchema = z.object({
  orderId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  stage: z.enum(["checkout", "fulfilled", "receipt", "customer_update"]),
  text: z.string().min(1).max(10000),
  createdAt: z.string().datetime(),
}).strict();

async function body(req: import("node:http").IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) throw new Error("Request body too large");
  }
  return JSON.parse(raw);
}

function reply(res: import("node:http").ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

async function main(): Promise<void> {
  await infrai.storage.bucket.create(bucket);
  await infrai.storage.bucket.set_lifecycle(bucket,
    [{ prefix: "checkout/", expire_days: 2 }], "checkout-retention-v1");

  createServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/orders/events") {
        const event = eventSchema.parse(await body(req));
        const key = objectKey(event);
        await infrai.storage.object.put(bucket, key,
          Buffer.from(JSON.stringify(event)).toString("base64"), `order-${event.stage}-${event.orderId}-${event.createdAt}`);
        reply(res, 201, { orderId: event.orderId, stage: event.stage, key });
      } else if (req.method === "POST" && new URL(req.url ?? "/", "http://localhost").pathname === "/sweep") {
        const token = new URL(req.url ?? "/", "http://localhost").searchParams.get("token");
        if (!process.env.SWEEP_TOKEN || token !== process.env.SWEEP_TOKEN) {
          reply(res, 401, { error: "Unauthorized" }); return;
        }
        const { items } = await infrai.storage.object.list(bucket);
        const expired = items.filter(item => shouldSweep(item.key, new Date()));
        for (const item of expired) await infrai.storage.object.delete(bucket, item.key);
        reply(res, 200, { deleted: expired.map(item => item.key) });
      } else reply(res, 404, { error: "Not found" });
    } catch (error) {
      if (error instanceof z.ZodError || error instanceof SyntaxError) reply(res, 400, { error: "Invalid event" });
      else if (error instanceof InfraiError) reply(res, error.status >= 400 && error.status < 500 ? error.status : 502,
        { error: error.code, message: error.message });
      else reply(res, 500, { error: error instanceof Error ? error.message : "Unknown error" });
    }
  }).listen(Number(process.env.PORT ?? 3000), () => console.log("Checkout service listening"));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
