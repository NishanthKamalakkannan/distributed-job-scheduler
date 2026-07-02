# API Documentation

The platform exposes a clean, validation-backed REST API using Express and Zod. All endpoints (except `/auth/login`) require a JWT token in the `Authorization` header.

`Authorization: Bearer <token>`

---

## 1. Authentication

### `POST /auth/login`
Authenticates a user and returns a JWT token.
- **Body:** `{ "email": "admin@example.com", "password": "password123" }`
- **Response (200):** `{ "token": "jwt...", "user": { "id": "...", "email": "..." } }`

---

## 2. Queues

### `GET /queues`
Lists all queues with their configuration.
- **Response (200):** `{ "data": [ { "id": "...", "name": "default", "isPaused": false, "concurrencyLimit": 10 } ] }`

### `POST /queues`
Creates a new queue.
- **Body:** `{ "projectId": "...", "name": "high-priority", "concurrencyLimit": 20 }`

### `POST /queues/:id/pause`
Pauses a queue (workers will stop claiming from it).

### `POST /queues/:id/resume`
Resumes a paused queue.

### `GET /queues/:id/stats`
Returns aggregated counts of jobs in the queue grouped by status.

---

## 3. Jobs

### `GET /jobs`
Lists jobs with pagination and filtering.
- **Query Params:** `?page=1&pageSize=20&status=COMPLETED&type=IMMEDIATE`
- **Response (200):** `{ "data": [...], "meta": { "total": 100, "page": 1, "totalPages": 5 } }`

### `POST /jobs`
Enqueues a new job (supports all types: IMMEDIATE, DELAYED, SCHEDULED, RECURRING, BATCH).
- **Body (Immediate):**
  ```json
  {
    "queueId": "<uuid>",
    "type": "IMMEDIATE",
    "payload": { "task": "video_encode" },
    "priority": 5
  }
  ```
- **Body (Delayed):** Add `"delaySeconds": 300`
- **Body (Recurring):** Add `"cronExpression": "0 * * * *"` and `"name": "Hourly Sync"`
- **Body (Batch):** Add `"batchPayloads": [{...}, {...}]` instead of `payload`.
- **Bonus features supported in body:**
  - `"idempotencyKey": "unique-string"` (prevents duplicate enqueues)
  - `"dependsOnJobId": "<uuid>"` (creates a workflow dependency)

### `GET /jobs/:id`
Retrieves a specific job, including its full execution history and structured logs.

### `POST /jobs/:id/cancel`
Cancels a job if it has not yet completed or failed.

### `POST /jobs/:id/retry`
Manually requeues a `FAILED` or `DEAD_LETTER` job back to `QUEUED` status.

### `POST /jobs/simulate`
Generates 50 mock jobs to simulate traffic (10% are designed to fail and trigger the Dead Letter Queue).

---

## 4. Workers

### `GET /workers`
Lists all registered workers, their current status (`ONLINE`, `DRAINING`, `OFFLINE`), concurrency capacity, and last heartbeat timestamp.

---

## 5. Dead Letter Queue (DLQ)

### `GET /dead-letter`
Lists all permanently failed jobs that have exceeded their `maxAttempts`.

### `POST /dead-letter/:id/retry`
Requeues the dead-lettered job for processing and marks the DLQ entry as reprocessed.
