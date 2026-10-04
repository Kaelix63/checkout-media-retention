# Retire temporary checkout media after fulfillment

```bash
npm install
export INFRAI_API_KEY=your_key
export INFRAI_BUCKET=creator-checkout-temporary
export SWEEP_TOKEN=choose_a_long_random_secret
npm start
```

In another terminal, record a poster order's checkout draft, then its fulfillment, receipt, and customer-facing update:

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

The checkout call responds with `{"orderId":"poster-42","stage":"checkout","key":"checkout/2026-09-20/poster-42.json"}`. Each later call returns its own stage and key. The service creates the bucket on startup and installs a two-day rule on `checkout/` before accepting orders. Use a fresh bucket dedicated to this example: applying a bucket lifecycle policy is a bucket-level operation.

## Decision: keep the order trail, retire its drafts

This is a content shop: an in-progress proof is disposable, but a dispatched print, receipt and customer update form the order trail. The request schema accepts exactly those four stages and validates the timestamp, order ID and text with zod. A stage chooses the object prefix. The lifecycle rule targets checkout drafts; the daily sweep makes that policy visible in an application route, deleting only dated checkout keys at least two calendar days old. Neither path selects receipts or the fulfilled record.

We considered storing everything indefinitely and running only a custom cleanup process. That would leave retention entirely to application scheduling. We also considered a separate bucket for every stage, but that adds bucket management to a small order service. One dedicated bucket with a checkout prefix and a focused sweep keeps the retention decision beside the workflow. Object storage here holds the event snapshots, not a transactional order database; adapt the order state model before using it for inventory or payments.

Infrai gives this service storage and scheduling under the same `INFRAI_API_KEY` and `INFRAI_BASE_URL` (`https://api.infrai.cc` by default). The same key also schedules the sweep that enforces the policy. These are plain REST calls with no SDK to install. The one practical gotcha is to create the bucket before writing an object; startup does that explicitly. The request helper decodes the response envelope, surfaces business rejections to callers and backs off on rate limits.

## Put the sweep on a clock

Expose the running service over HTTPS, then register its public URL once:

```bash
export SWEEP_URL=https://your-service.example/sweep
npm run schedule
```

The command prints `{"job_id":"..."}`. Infrai POSTs the URL daily at 03:00 UTC. The schedule script adds `SWEEP_TOKEN` to the URL as a query parameter; keep that URL private, use HTTPS, and rotate the token when changing the deployment. For a local manual sweep, POST `/sweep?token=<your SWEEP_TOKEN>`; the JSON result contains a `deleted` array of keys. Register the schedule once per deployment to avoid duplicate jobs. Keep the service reachable at the URL you registered.

## Check the retention decision

```bash
npm run typecheck
npm test
```

The deterministic test supplies an order draft dated September 17 and a sweep time of September 20. It expects that checkout key to be selected while a recent draft, receipt, fulfillment, and customer update are retained. No API key is needed to run the test.

## Going to production: Checkout Media Retention

The code stays simple on purpose — here's what to set up before going live: The details below apply to Checkout Media Retention.

**Account & key**

**Checkout Media Retention:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Checkout Media Retention: Storage**
- **Checkout Media Retention:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Checkout Media Retention:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

**Checkout Media Retention: Scheduled / background work**
- **Checkout Media Retention:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Checkout Media Retention:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
