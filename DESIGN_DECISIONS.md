# Design & Architecture Decisions

This document outlines the core engineering trade-offs and architectural decisions made while building this Distributed Job Scheduler.

## 1. Why PostgreSQL for Queues?

Traditional job schedulers (like Sidekiq, BullMQ, or Celery) typically rely on Redis or RabbitMQ for queue management due to their in-memory speed. However, using PostgreSQL provides several massive advantages for our architecture:

- **Operational Simplicity:** Only one piece of infrastructure (Postgres) to deploy, monitor, and back up, rather than needing both a DB (for metadata) and Redis (for queues).
- **Transactional Guarantees:** We can create a user, deduct credits, and enqueue a job within a single ACID transaction. This is incredibly difficult to achieve cleanly when spanning Postgres and Redis.
- **Relational Integrity:** A job natively belongs to a Project, Queue, and RetryPolicy via Foreign Keys. If a Queue is deleted, Postgres handles cascading deletions naturally.
- **Payload Size:** Redis is constrained by memory. Postgres can store large JSON payloads on disk effortlessly.

### How we solved the Concurrency Problem
The historical problem with DB-backed queues is multiple workers claiming the same job, leading to race conditions. 
We solved this using PostgreSQL's **`FOR UPDATE SKIP LOCKED`** feature.

```sql
UPDATE "Job"
SET status = 'CLAIMED', "workerId" = 'node-1'
WHERE id = (
  SELECT id FROM "Job" 
  WHERE status = 'QUEUED'
  ORDER BY priority DESC, "createdAt" ASC 
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
```
This query atomically locks a row and immediately skips any rows already locked by other concurrent queries. It allows dozens of workers to poll the same queue simultaneously with zero deadlocks and high throughput.

## 2. Monorepo Structure

We utilized `npm workspaces` to structure the project as a monorepo.

- **`/prisma`**: The single source of truth for the database schema and generated client. Every other package depends on this, ensuring absolute type safety across the entire stack.
- **`/api`**: The Express server that exposes the REST API to users and the dashboard. It only reads/writes to the DB, it does *not* execute jobs.
- **`/worker`**: A completely isolated Node process that polls the database and executes jobs. It can be scaled horizontally to $N$ instances by simply spinning up more containers.
- **`/scheduler`**: A singleton process (enforced by DB locks) responsible for Cron jobs and infrastructure cleanup.

## 3. The Scheduler & Dead Worker Reaper

### The Cron Problem
Cron expressions (`* * * * *`) need a process to evaluate them. If you have 5 workers, you don't want all 5 workers evaluating the cron and spawning 5 duplicate jobs.

**Solution:** The `/scheduler` service uses distributed locking on the `ScheduledJob` table. Only one scheduler process can lock a recurring job at a time. It evaluates the expression using `cron-parser`, spawns standard `IMMEDIATE` jobs into the queue, and updates the `nextRunAt` timestamp for the next cycle.

### The Zombie Worker Problem
What happens if a Worker process OOMs, is `kill -9`'d, or the server loses power while it is executing a job? That job would be stuck in `CLAIMED` or `RUNNING` status forever.

**Solution:** 
1. Workers emit a heartbeat every 15 seconds, updating their `lastHeartbeat` timestamp in the `Worker` table.
2. The `/scheduler` runs a "Reaper" routine every minute. It finds any worker whose heartbeat is older than 60 seconds, marks it as `OFFLINE`, and automatically requeues any jobs that were assigned to it back to `QUEUED`.

## 4. Polling vs WebSockets for the UI

The web dashboard uses a "smart polling" technique (fetching data every 3 seconds) rather than WebSockets.
- **Why?** It keeps the API completely stateless. In a distributed environment, WebSockets require sticky sessions or an external PubSub mechanism (like Redis) to broadcast events across API nodes. Smart polling via React hooks provides near real-time UX without the massive infrastructure overhead of stateful connections.

## 5. Database Design Analysis

### Primary Keys & UUID Selection
All primary keys throughout the schema use **UUIDv4**. 
- **Reason:** In a distributed environment, generating integer IDs requires centralized coordination (e.g., auto-increment sequences), creating a performance bottleneck and preventing offline/detached ID generation. UUIDs provide collision-free, decentralized ID allocation across distributed workers and clients.

### Foreign Keys & Cascading Behavior
The database strictly models relational ownership to guarantee database consistency without manual app-level cleanups:
1. **`onDelete: Cascade`**: Used for child-owner relationships. If a `Project` is deleted, its `Queues` are dropped. If a `Job` is deleted, all `JobExecutions`, `JobLogs`, and `DeadLetterJob` entries are automatically purged. If a `BATCH` parent job is deleted, its child jobs cascade-delete.
2. **`onDelete: SetNull`**: Used for configuration references. If a `RetryPolicy` is deleted, `Job.retryPolicyId` is set to null, allowing the job to fall back to system defaults instead of crashing or failing database constraints.
3. **`onDelete: Restrict`**: Used to prevent accidental deletions of critical parents. For example, a `User` record cannot be deleted if they are marked as the creator of an active `Project`.

### Normalization (3NF compliance)
The schema complies with Third Normal Form (3NF). Data redundancy is eliminated:
- Logs are isolated to `JobLog`, preventing `Job` rows from bloating.
- Active worker heartbeats are separated into `WorkerHeartbeat` and `Worker` tables. The `Worker` table only maintains current state fields (`status`, `lastSeenAt`), while log timelines are kept in the heartbeat table.
- Cron definitions live in `ScheduledJob` separate from active queue entities in `Job`.

### Indexing Strategy & Concurrency Performance
To prevent sequential table scans as the `Job` table grows into millions of records, we designed highly optimized composite indexes:
- **`@@index([queueId, status, priority, runAt])`**: This is the most critical index in the system. The worker claim query filters by `queueId`, `status = 'QUEUED'`, and `runAt <= now()`, sorting by `priority DESC` and `createdAt ASC`. Placing these columns in a compound index allows PostgreSQL to perform an Index Scan directly to find the lock candidate, keeping claim latency sub-millisecond even under high table loads.
- **`@@index([status, lastSeenAt])`**: Used by the scheduler reaper to locate inactive workers quickly.
- **`@@index([jobId, createdAt])`**: Optimizes loading job log history for dashboard view.

