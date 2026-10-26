import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: Number(__ENV.VUS || 10),
  iterations: Number(__ENV.ITERATIONS || 500),
  summaryTrendStats: ["avg", "p(50)", "p(95)", "p(99)"],
  thresholds: { http_req_failed: ["rate<0.01"] },
};

const api = __ENV.API || "http://localhost:8080/api/v1";
const scale = __ENV.SCALE || "unknown";

export default function () {
  const id = `${scale}-${__VU}-${__ITER}`;
  const body = JSON.stringify({
    categoryCode: "POTHOLE",
    lat: 30.905 + Math.random() * 0.05,
    lng: 75.785 + Math.random() * 0.07,
    accuracyM: 8,
    manualPin: false,
    description: "Latency evaluation report",
    photoUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    photoHash: Number(`${__VU}${__ITER}`).toString(16).padStart(16, "0").slice(-16),
    deviceId: `latency-${id}`,
  });
  const response = http.post(`${api}/reports`, body, {
    headers: { "Content-Type": "application/json" },
  });
  check(response, { "report accepted": (result) => result.status === 201 });
}

export function handleSummary(data) {
  const values = data.metrics.http_req_duration.values;
  const failed = data.metrics.http_req_failed.values.rate;
  const csv = "scale,requests,p50_ms,p95_ms,p99_ms,average_ms,failure_rate\n" +
    `${scale},${data.metrics.http_reqs.values.count},${values["p(50)"]},${values["p(95)"]},${values["p(99)"]},${values.avg},${failed}\n`;
  return { [`artifacts/evaluation/latency-${scale}.csv`]: csv, stdout: csv };
}
