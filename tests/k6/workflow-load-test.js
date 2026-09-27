import http from 'k6/http';
import { check, sleep } from 'k6';

// Supply the Google subject id at run time:
//   k6 run -e TASKPAD_USER_ID=<sub> tests/k6/workflow-load-test.js
const USER_ID = __ENV.TASKPAD_USER_ID;
const BASE_URL = __ENV.BASE_URL || 'https://taskpad.duckdns.org';

if (!USER_ID) {
  throw new Error('TASKPAD_USER_ID is required: k6 run -e TASKPAD_USER_ID=<sub> ...');
}

export const options = {
  vus: 50,
  duration: '5m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
    http_req_tls_handshaking: ['p(95)<500', 'avg<100'], // flag slow TLS handshakes
  },
};

function logSlowRequest(res) {
  if (res.timings.duration > 1000) {
    console.log(JSON.stringify({
      waiting: res.timings.waiting,
      connecting: res.timings.connecting,
      tls: res.timings.tls_handshaking,
      total: res.timings.duration,
      url: res.url,
    }));
  }
}

export default function () {
  // Step 1: Add a task
  const createRes = http.post(
    `${BASE_URL}/api/tasks?user_id=${USER_ID}`,
    JSON.stringify({ title: `load-test-task-${Date.now()}`, category: 'gray', due_date: '' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(createRes, {
    'task created (201 or 200)': (r) => r.status === 201 || r.status === 200,
  });
  logSlowRequest(createRes);

  const taskId = createRes.json('id') || createRes.json('_id') || createRes.json('task_id');

  if (!taskId) {
    console.error(`Could not extract task ID from response: ${createRes.body}`);
    return;
  }

  sleep(1);

  // Step 2: Mark the task as done
  const patchRes = http.patch(
    `${BASE_URL}/api/tasks/${taskId}?user_id=${USER_ID}`,
    JSON.stringify({ completed: true }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(patchRes, {
    'task marked done (200)': (r) => r.status === 200,
  });
  logSlowRequest(patchRes);

  sleep(1);

  // Step 3: Delete the task
  const deleteRes = http.del(
    `${BASE_URL}/api/tasks/${taskId}?user_id=${USER_ID}`
  );

  check(deleteRes, {
    'task deleted (200 or 204)': (r) => r.status === 200 || r.status === 204,
  });
  logSlowRequest(deleteRes);

  sleep(1);
}
