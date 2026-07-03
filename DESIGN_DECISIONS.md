# Design Decisions & Trade-offs

This document outlines the major architectural and technical design decisions made while building the Distributed Job Scheduler, including the reasoning behind trade-offs.

## 1. PostgreSQL as the Primary Data Store and Message Broker
**Decision:** We chose to use PostgreSQL as both our source of truth for configuration/metadata and our concurrent job queue, rather than introducing a separate message broker like Redis (BullMQ) or RabbitMQ.

**Trade-offs:**
- *Pros:* 
  - Simplifies the architecture significantly by requiring only one infrastructure dependency (PostgreSQL).
  - Eliminates the dual-write problem. Transactions guarantee that job metadata, history, and status updates are atomically synced with the queue state.
  - Using `FOR UPDATE SKIP LOCKED`, Postgres provides extremely robust row-level locking for atomic job claims, preventing duplicate executions across distributed workers.
- *Cons:*
  - Postgres is not as fast as in-memory Redis for extreme high-throughput polling (millions of jobs/sec). 
  - Polling a relational database adds load to the database CPU. However, with appropriate indexing (`queueId, status, priority, runAt`) and a reasonable polling interval, it easily supports thousands of jobs per second, which is adequate for most enterprise workloads.

## 2. Polling vs. WebSockets for Dashboard Live Updates
**Decision:** The React dashboard implements HTTP polling (every 3 seconds) instead of WebSockets.

**Trade-offs:**
- *Pros:* 
  - Extremely stateless and easy to scale horizontally. 
  - The API does not need to maintain stateful TCP connections, reducing memory overhead on the API nodes.
  - Simplifies the API implementation and avoids issues with WebSocket reconnection logic and load balancer configurations on platforms like Render.
- *Cons:*
  - Adds a slight delay (up to 3 seconds) before updates reflect in the UI.
  - Can generate unnecessary network traffic when the system is idle. Given the dashboard is an internal tool with limited concurrent users, this overhead is negligible.

## 3. Worker Design: Pull vs. Push
**Decision:** Workers are designed to "pull" (poll) jobs from the database rather than having the API "push" jobs to workers via webhooks or persistent connections.

**Trade-offs:**
- *Pros:*
  - True horizontal scaling: You can add 100 worker nodes to the cluster and they will naturally load balance by competing for locks (`SKIP LOCKED`).
  - Self-healing: If a worker crashes, it just stops pulling. The API doesn't need to track connections or handle push failures.
  - Fair dispatch: Workers only claim jobs when they have available concurrency slots, preventing them from being overwhelmed.
- *Cons:*
  - The latency from job creation to execution is bound by the polling interval (e.g., 1-2 seconds) rather than being instantaneous.

## 4. Concurrency Control and Heartbeats
**Decision:** We implemented an active heartbeat mechanism (workers ping the DB every 5s) and a Dead Worker Reaper (runs every 1 minute).

**Trade-offs:**
- *Pros:*
  - Solves the problem of "zombie jobs"—jobs claimed by a worker that subsequently OOMs, crashes, or loses network before completing the job. The Reaper detects stale heartbeats, marks the worker as OFFLINE, and safely requeues the jobs.
- *Cons:*
  - Generates background write traffic to the database (heartbeats). We mitigate this by only updating heartbeats every 5 seconds rather than per-job.

## 5. Mono-repo Architecture
**Decision:** The project is organized as an `npm` workspace mono-repo (`api`, `worker`, `web`, `prisma`).

**Trade-offs:**
- *Pros:*
  - Shared types! The frontend, API, and worker all share the exact same generated Prisma types and database enums.
  - Single commit history for features that touch frontend, backend, and database.
- *Cons:*
  - Deployment requires slightly more complex build commands (e.g., building dependencies from the root before deploying a sub-package).

## 6. Monolithic Database Schema
**Decision:** All entities (Users, Projects, Queues, Jobs, Logs) live in a single PostgreSQL database with strict foreign keys and cascading deletes.

**Trade-offs:**
- *Pros:*
  - Deleting a Queue automatically cleans up all associated Jobs, Executions, and Logs via `ON DELETE CASCADE`.
  - Referential integrity guarantees that a job cannot be assigned to a non-existent queue or retry policy.
- *Cons:*
  - Vertical scaling limit: Eventually, the single database could become a bottleneck. If this occurs, the Job logs (which grow fastest) would be the first candidate to shard or move to a separate datastore like ClickHouse or Elasticsearch.

## 7. Bonus Features

- **Distributed Locking:** We implemented atomic leader election for the Scheduler using a `ScheduledJob.lockedBy`/`lockedUntil` update pattern. This prevents double-spawning recurring jobs when multiple scheduler instances are running concurrently. We consciously reused the same `UPDATE ... WHERE ... RETURNING` pattern as the worker's job-claiming logic to maintain architectural consistency.
- **Workflow Dependencies:** Jobs support a self-relational `dependsOnJobId` field. The atomic claim query in `WorkerService.ts` filters out any jobs whose dependency hasn't reached `COMPLETED`. We made the trade-off to support only single-parent dependencies (rather than a full DAG) because it's significantly simpler to reason about in SQL and sufficient for the assignment scope, at the cost of not supporting complex "wait for multiple jobs" fan-in.

## 8. Lessons Learned / Notable Bugs Fixed

- **Silent API Changes in Dependencies:** The `cron-parser` library introduced a breaking API change between v4 and v5 (replacing `.parseExpression()` with a static `CronExpressionParser.parse()`). Because the calling code was wrapped in a `try/catch` with a silent fallback (+60s), the runtime failure was swallowed entirely. This highlighted why silent fallbacks in error-handling code deserve intense scrutiny during testing, as they easily mask regressions.
- **Idempotency in Error Paths (DLQ):** When manually retrying a job that had previously hit the Dead Letter Queue, a second failure would attempt to insert another `DeadLetterJob` record. Since `jobId` is a unique constraint, this would throw an unhandled database error. We learned that error transitions must also be idempotent, and replaced `.create()` with `.upsert()` to safely update existing DLQ records when jobs repeatedly exhaust their retries.
