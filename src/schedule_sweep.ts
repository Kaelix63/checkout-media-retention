import { infrai } from "./infrai.ts";

const task = process.env.SWEEP_URL;
const token = process.env.SWEEP_TOKEN;
if (!task || !token || new URL(task).protocol !== "https:") throw new Error("Set HTTPS SWEEP_URL and SWEEP_TOKEN");
const url = new URL(task);
url.searchParams.set("token", token);
const result = await infrai.cron.create(url.toString());
console.log(JSON.stringify({ job_id: result.job_id }));
