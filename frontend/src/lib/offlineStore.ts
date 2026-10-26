/** Only drafts and submitted-report jobs live here. Never credentials. */
export function offlineStore<T>(store: "drafts" | "outbox", action: "get" | "put" | "delete" | "all", key?: string, value?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("civictrack-offline", 1);
    open.onupgradeneeded = () => { open.result.createObjectStore("drafts"); open.result.createObjectStore("outbox", { keyPath: "id" }); };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(store, action === "get" || action === "all" ? "readonly" : "readwrite");
      const table = tx.objectStore(store);
      const request = action === "get" ? table.get(key!) : action === "all" ? table.getAll() : action === "delete" ? table.delete(key!) : store === "outbox" ? table.put(value) : table.put(value, key!);
      tx.oncomplete = () => { db.close(); resolve(request.result as T); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Storage was not available.")); };
    };
  });
}

export interface OfflineJob {
  id: string;
  userId: string | null;
  body: Record<string, unknown>;
  blob: Blob | null;
  cloud: string;
  preset: string;
  createdAt: number;
  nextAttempt: number;
  attempts: number;
  state: "pending" | "failed" | "sent";
  message?: string;
  publicRef?: string;
}

export async function wakeOutbox() {
  if (!("serviceWorker" in navigator)) throw new Error("Background submission is not supported by this browser. Keep the draft and submit when online.");
  const registration = await navigator.serviceWorker.register("/report-worker.js");
  await navigator.serviceWorker.ready;
  const sync = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
  if (sync) await sync.register("ct-report-outbox").catch(() => {});
  registration.active?.postMessage("send-reports");
}

export async function queueReport(job: OfflineJob) {
  const jobs = await offlineStore<OfflineJob[]>("outbox", "all");
  if (jobs.filter(item => item.state !== "sent").length >= 30) throw new Error("Your outbox is full. Remove or send an older report first.");
  await offlineStore("outbox", "put", job.id, job);
  // Persist first: even if worker registration fails, the outbox offers retry.
  await wakeOutbox().catch(() => {});
}
