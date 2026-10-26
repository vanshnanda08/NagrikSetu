/* No asset cache: this worker sends only reports the user explicitly queued. */
function store(action, value) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("civictrack-offline", 1);
    open.onupgradeneeded = () => { open.result.createObjectStore("drafts"); open.result.createObjectStore("outbox", { keyPath: "id" }); };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("outbox", action === "all" ? "readonly" : "readwrite");
      const table = tx.objectStore("outbox");
      const request = action === "all" ? table.getAll() : table.put(value);
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
async function send() {
  const jobs = await store("all");
  let retry = false;
  for (const job of jobs) {
    if (job.state !== "pending") continue;
    if (job.nextAttempt > Date.now()) { retry = true; continue; }
    try {
      if (!job.body.photoUrl) {
        if (!job.cloud || !job.preset || !job.blob) throw Object.assign(new Error("Photo upload is not configured. Your photo is still saved."), { permanent: true });
        const form = new FormData(); form.append("file", job.blob); form.append("upload_preset", job.preset);
        const upload = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(job.cloud)}/image/upload`, { method: "POST", body: form });
        if (!upload.ok) throw new Error("Photo upload failed; waiting to retry.");
        const result = await upload.json();
        if (typeof result.secure_url !== "string") throw new Error("Photo service returned no URL.");
        job.body.photoUrl = result.secure_url;
        await store("put", job);
      }
      const submit = () => fetch("/api/offline-report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, userId: job.userId, body: job.body }),
      });
      const response = self.navigator.locks ? await self.navigator.locks.request("ct-auth-cookie", submit) : await submit();
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const seconds = Number(response.headers.get("Retry-After"));
        throw Object.assign(new Error(result.detail || "Submission failed."), {
          permanent: response.status >= 400 && response.status < 500 && response.status !== 429,
          retrySeconds: Number.isFinite(seconds) ? seconds : 0,
        });
      }
      job.state = "sent"; job.publicRef = result.publicRef; job.message = "Report sent.";
      // Remove photo and location from local storage once delivery is confirmed.
      job.blob = null; job.body = {};
    } catch (error) {
      job.attempts++;
      job.message = error.message || "Connection lost. Waiting to retry.";
      job.state = error.permanent ? "failed" : "pending";
      job.nextAttempt = Date.now() + Math.max(error.retrySeconds || 0, Math.min(3600, 30 * 2 ** Math.min(job.attempts, 7))) * 1000;
      retry ||= !error.permanent;
    }
    await store("put", job);
    for (const client of await self.clients.matchAll()) client.postMessage("outbox-updated");
  }
  if (retry) throw new Error("Reports remain queued for retry.");
}
let active;
function drain() {
  if (!active) active = (self.navigator.locks ? self.navigator.locks.request("ct-report-outbox", send) : send()).finally(() => { active = null; });
  return active;
}
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("sync", event => { if (event.tag === "ct-report-outbox") event.waitUntil(drain()); });
self.addEventListener("message", event => { if (event.data === "send-reports") event.waitUntil(drain().catch(() => {})); });
