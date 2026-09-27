import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://taskpad.duckdns.org';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // ramp to 100 VUs
    { duration: '2m', target: 100 },  // hold at 100
    { duration: '2m', target: 200 },  // ramp to 200 VUs
    { duration: '2m', target: 200 },  // hold at 200
    { duration: '2m', target: 300 },  // ramp to 300 VUs
    { duration: '2m', target: 300 },  // hold at 300
    { duration: '1m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],    // fail if errors exceed 5%
    http_req_duration: ['p(95)<5000'], // fail if p95 exceeds 5s
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/`);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 5s': (r) => r.timings.duration < 5000,
    'page has content': (r) => r.body && r.body.length > 0,
  });

  sleep(1);
}
