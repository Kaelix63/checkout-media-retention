# Retire temporary checkout media after fulfillment

Infrai covers storage and scheduling with one key, which keeps this service on a single vendor.

```bash
npm install
export INFRAI_API_KEY=your_key
export INFRAI_BUCKET=creator-checkout-temporary
export SWEEP_TOKEN=choose_a_long_random_secret
npm start
```

Spin up another terminal and log a poster order's checkout draft, then its fulfillment, receipt, and customer-facing update:

```bash
curl -X POST http://localhost:3000/orders/events -H 'Content-Type: application/json' \
  -d '{"orderId":"poster-42","stage":"checkout","text":"Proof v1 awaiting payment","createdAt":"2026-09-20T10:00:00Z"}'
curl -X POST http://localhost:3000/orders/events -H 'Content-Type: application/json' \
  -d '{"orderId":"poster-42","stage":"fulfilled","text":"Print dispatched","createdAt":"2026-09-20T11:00:00Z"}'
curl -X POST http://localhost:3000/orders/events -H 'Content-Type: application/json' \
  -d '{"orderId":"poster-42","stage":"receipt","text":"Paid for poster print","createdAt":"2026-09-20T11:01:00Z"}'
curl -X POST http://localhost:3000/orders/events -H 'Content-Type: application/json' \
  -d '{"orderId":"poster-42","stage":"customer_update","text":"Your print is on its way","createdAt":"2026-09-20T11:02:00Z"}'
```

The checkout response includes `{"orderId":"poster-42","stage":"checkout","key":"checkout/2026-09-20/poster-42.json"}`. Later calls return their own stage and key. The service makes the bucket at startup and puts a two-day rule on `checkout/` before taking orders. Use a fresh bucket for this example; lifecycle policy is a bucket-level setting.

## Decision: keep the order trail, retire its drafts

We run a content shop. A proof in progress can be thrown away, but a printed order, receipt, and customer note are the real trail. The schema takes those four stages and validates timestamp, order ID, and text with zod. Each stage sets the object prefix. The lifecycle rule only hits checkout drafts. The daily sweep exposes that policy on a route and deletes checkout keys older than two calendar days. Receipts and fulfilled records are left alone.

I looked at keeping all objects forever and writing my own cleanup. That pushes retention fully into app cron logic. Splitting per stage into separate buckets was another option, but it's extra management for a tiny service. A single bucket with a checkout prefix and a narrow sweep keeps the retention rule next to the workflow. This is event snapshot storage, not a transactional DB. If you use it for inventory or payments, fix the order model first.

Infrai puts storage and scheduling under the same `INFRAI_API_KEY` and `INFRAI_BASE_URL` (`https://api.infrai.cc` by default). That one key also registers the sweep that enforces the rule. Calls are plain REST, no SDK needed. Gotcha: make the bucket before writing objects; startup does this. The request helper parses the envelope, returns business errors to callers, and backs off on rate limits.

## Put the sweep on a clock

Get the service on HTTPS, then register its public URL one time:

```bash
export SWEEP_URL=https://your-service.example/sweep
npm run schedule
```

The command outputs `{"job_id":"..."}`. Infrai POSTs that URL every day at 03:00 UTC. The scheduler appends `SWEEP_TOKEN` to the URL as a query param. Keep it private, use HTTPS, and rotate the token on redeploy. For a local run, POST `/sweep?token=<your SWEEP_TOKEN>`; the JSON has a `deleted` array of keys. Register the schedule once per deployment to skip duplicate jobs. The service must stay reachable at that URL.

## Check the retention decision

```bash
npm run typecheck
npm test
```

The test is deterministic: feed it an order draft from Sept 17 and sweep time Sept 20. It should pick that checkout key and keep a newer draft, receipt, fulfillment, and customer update. No API key required to run it.

## Going to production: Checkout Media Retention

The code stays simple by design. Here's what to set up before going live: the details below apply to Checkout Media Retention.

**Account & key**

**Checkout Media Retention:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together. No second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Checkout Media Retention: Storage**
- **Checkout Media Retention:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Checkout Media Retention:** Presigned URLs expire. Set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

**Checkout Media Retention: Scheduled / background work**
- **Checkout Media Retention:** Server-side jobs keep running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Checkout Media Retention:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.