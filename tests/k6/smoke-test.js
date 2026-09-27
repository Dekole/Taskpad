import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://taskpad.duckdns.org';

export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],   // less than 1% errors
    http_req_duration: ['p(95)<3000'], // 95% of requests under 3s
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/`);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 3s': (r) => r.timings.duration < 3000,
    'page has content': (r) => r.body && r.body.length > 0,
  });

  sleep(1);
}
