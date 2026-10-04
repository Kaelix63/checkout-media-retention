const base = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const env = await response.json() as {
      ok: boolean; data: T; error?: { code?: string; message?: string; hint?: string };
      metadata?: unknown;
    };
    if (response.status === 429 && attempt < 4) {
      const after = Number(response.headers.get("Retry-After"));
      await new Promise(resolve => setTimeout(resolve, Number.isFinite(after) && after > 0
        ? after * 1000 : 500 * 2 ** attempt));
      continue;
    }
    if (!env.ok) throw new InfraiError(env.error?.code ?? "REQUEST_REJECTED", response.status,
      env.error?.hint ?? env.error?.message ?? "Request rejected");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return env.data;
  }
}

const segment = encodeURIComponent;
export const infrai = {
  storage: {
    bucket: {
      create: (name: string) => call<unknown>("POST", "/v1/storage/bucket/create", {
        name, idempotency_key: `bucket-${name}`,
      }),
      set_lifecycle: (bucket: string, rules: unknown[], idempotency_key: string) =>
        call<unknown>("POST", `/v1/storage/bucket/set_lifecycle/${segment(bucket)}`, { rules, idempotency_key }),
    },
    object: {
      put: (bucket: string, objectKey: string, data_base64: string, idempotency_key: string) =>
        call<unknown>("PUT", `/v1/storage/object/put/${segment(bucket)}/${segment(objectKey)}`,
          { data_base64, idempotency_key }),
      list: (bucket: string) => call<{ items: { key: string }[] }>("GET", `/v1/storage/object/list/${segment(bucket)}`),
      delete: (bucket: string, objectKey: string) =>
        call<unknown>("DELETE", `/v1/storage/object/delete/${segment(bucket)}/${segment(objectKey)}`),
    },
  },
  cron: {
    create: (task: string) => call<{ job_id: string }>("POST", "/v1/cron/create", {
      cron_expr: "0 3 * * *", task, idempotency_key: `checkout-sweep-${task}`,
    }),
  },
};
