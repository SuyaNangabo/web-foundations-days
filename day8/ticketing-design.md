# TicketHub Design Document

TicketHub is a website that sells tickets for concerts and events. Most days it is quiet, but when a very popular concert goes on sale, thousands of people try to buy the same seats at the same moment. The system must stay up during that rush, treat people fairly, and **never sell the same seat twice**. This document follows the six-part framework: requirements, estimates, API, data model, architecture and trade-offs.

**Facts I started from**

- There are 2 million registered users.
- On a normal day, 50,000 people visit and each views 10 pages.
- On a normal day, 5,000 tickets are sold.
- When a popular concert goes on sale, 200,000 people try to buy its 20,000 seats within the first 10 minutes.

## 1. Requirements

### Functional requirements

- Users can register and log in.
- Users can browse and search events, and see an event's details and sale time.
- Users can see a seat map showing which seats are available.
- Users can select seats and hold them for 8 minutes while they pay.
- Users can release a hold, or let it expire.
- Users can pay for held seats and receive tickets (by email and in their account, with a code).
- Users can view their tickets.
- For very popular sales, users join a waiting room and are let in at a controlled rate.

**Out of scope:** refunds, ticket resale or transfer, organiser tools and drawing the seat map.

### Non-functional requirements

| Quality          | Requirement                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Correctness**  | A seat is sold to at most one person, with no exceptions. A customer is never charged without getting a ticket, and never gets a ticket without paying.                                                                  |
| **Speed**        | Browsing pages load in under 300 ms for 95% of requests. The seat map loads in under 500 ms. Holding seats responds within 1 second, even during a big sale.                                                             |
| **Fairness**     | Nobody can jump the queue during a big sale. Everyone gets a place in the waiting room, bots are slowed down, and each person is limited to 4 tickets per event. Everyone gets a clear answer: waiting, in, or sold out. |
| **Availability** | 99.9% overall (about 8.8 hours of downtime a year). The sale window is protected with no planned maintenance and extra capacity ready.                                                                                   |
| **Scalability**  | Handle about 1,300 times normal traffic for short bursts without a redesign.                                                                                                                                             |
| **Durability**   | A paid order and its tickets are never lost (replicated database and backups).                                                                                                                                           |
| **Consistency**  | Strong for seats, orders and payments (one primary database). A couple of seconds of delay is fine for browsing pages and the seat map display.                                                                          |
| **Security**     | HTTPS, hashed passwords, token authentication, rate limiting, parameterised SQL queries, and card details handled only by the payment provider.                                                                          |

## 2. Estimates

### Assumptions

- One day is about 100,000 seconds (rounded from 86,400), and peak traffic is 5 times the average.
- Each page view is one request.
- An average order has 2 tickets, so 5,000 tickets a day is about 2,500 orders.
- In the big sale, each of the 200,000 people makes about 20 requests in the 10 minutes: 1 event page, 15 seat-map views (they keep refreshing as seats disappear), 3 hold attempts and 1 payment attempt.
- A normal-day order takes about 0.5 KB and a ticket about 0.3 KB. A seat row takes about 150 bytes, and there are about 1,000 events a year with about 10,000 seats each.

### Normal day

- Page views per day: 50,000 × 10 = 500,000, so **5 requests per second** on average and **25 per second** at peak.
- Tickets sold: 5,000 per day, so **0.05 per second** on average and **0.25 per second** at peak.
- There are 100 page views for every ticket sold, so a normal day is read-heavy.
- Storage per year: about 1 GB of orders and tickets plus about 1.5 GB of seat rows, so **about 2.5 GB per year**.

### Big sale (the first 10 minutes = 600 seconds)

- People arriving: 200,000 ÷ 600 = about 333 per second on average, and about 1,670 per second at peak.
- Total requests: 200,000 × 20 = 4,000,000, so **about 6,700 per second** on average and **about 33,000 per second** at peak.
  - Seat-map reads: 200,000 × 15 = 3,000,000, so 5,000 per second on average and **25,000 per second** at peak.
  - Hold attempts: 200,000 × 3 = 600,000, so 1,000 per second on average and **5,000 per second** at peak.
  - Event page and payment attempts: about 1,670 per second each at peak.
- Tickets sold: 20,000 ÷ 600 = **33 per second** on average and **about 167 per second** at peak.
- Disappointed buyers: 200,000 − 20,000 = **180,000 people (90%)** will not get a seat.

### Comparison

| Measure                           | Normal day         | Big sale (10 minutes) | How much bigger                      |
| --------------------------------- | ------------------ | --------------------- | ------------------------------------ |
| Requests per second (average)     | 5                  | 6,700                 | about 1,300×                         |
| Requests per second (peak)        | 25                 | 33,000                | about 1,300×                         |
| Tickets sold per second (average) | 0.05               | 33                    | about 670×                           |
| Tickets sold per second (peak)    | 0.25               | 167                   | about 670×                           |
| Tickets sold in total             | 5,000 per day      | 20,000 in 10 minutes  | 4× a whole day's sales in 10 minutes |
| Storage added                     | about 7 MB per day | about 20 MB           | tiny in both cases                   |

### What the numbers tell me

- **A normal day is easy.** 25 requests per second and under 1 write per second could run on a single server and a single database.
- **The big sale is a different problem.** Traffic is about 1,300 times higher and arrives in the first seconds. Because there are 10 buyers for every seat, most requests are a contest over the same 20,000 rows.
- **Reads dominate** (about 30,000 of the 33,000 peak requests are seat-map views and page loads), so they must be served from a CDN and a cache, not the database.
- **Writes are tiny but contested.** Only 167 sales per second can succeed, but 5,000 hold attempts per second fight for the same rows. The failures must be rejected cheaply, before they reach the database.
- **Storage is not the problem.** The challenge is concurrency and correctness, not size.

### What reaches each part at the peak

| Traffic                                     | Without protection | With this design                                                                                                            |
| ------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Event page and static files (about 1,670/s) | App servers        | Served by the CDN, so 0 reach the app                                                                                       |
| Seat-map reads (25,000/s)                   | The database       | About 4,000/s from admitted shoppers only, answered by Redis                                                                |
| Hold attempts (5,000/s)                     | The database       | At most about 600/s reach the Redis gate, and about 200/s reach the database (the winners)                                  |
| Waiting-room checks                         | Not applicable     | About 20,000/s of tiny requests (200,000 people checking every 10 seconds), answered by the waiting-room service from Redis |
| Payments (1,670/s)                          | The database       | At most 167/s, only from people who hold seats                                                                              |

## 3. API design

**Base URL:** `https://api.tickethub.com/v1`. Registration and login work as in QuickNotes (`POST /users` and `POST /auth/login`).

**Rules**

- Resources are plural nouns, and the HTTP method is the action. JSON is used everywhere.
- Authentication uses `Authorization: Bearer <token>`.
- During a big sale, `POST /events/{id}/holds` also needs an `X-Admission-Token` header, which the waiting room gives out.
- `POST` requests that hold seats or take payment need an `Idempotency-Key` header, so a double-click or a retry never creates a second order or a second payment.
- Money is in cents, with the currency stated (for example `KES`). A hold is for up to 4 seats.

### Endpoints

| Method | Path                           | Description                                                        | Success status |
| ------ | ------------------------------ | ------------------------------------------------------------------ | -------------- |
| GET    | `/events`                      | Browse and search events (filters: city, date, search; pagination) | 200 OK         |
| GET    | `/events/{id}`                 | Event details, including when the sale opens                       | 200 OK         |
| GET    | `/events/{id}/seats`           | Seat map with each seat's status (optional `section` filter)       | 200 OK         |
| POST   | `/events/{id}/waiting-room`    | Join the waiting room for a popular sale                           | 202 Accepted   |
| GET    | `/events/{id}/waiting-room/me` | My place in line, and an admission token when it is my turn        | 200 OK         |
| POST   | `/events/{id}/holds`           | Hold seats for 8 minutes (creates a pending order)                 | 201 Created    |
| DELETE | `/orders/{id}`                 | Cancel a pending order and release its seats                       | 204 No Content |
| POST   | `/orders/{id}/payments`        | Pay for a held order and receive tickets                           | 201 Created    |
| GET    | `/orders/{id}`                 | View one order                                                     | 200 OK         |
| GET    | `/me/tickets`                  | View all my tickets                                                | 200 OK         |

### View seats

```http
GET /v1/events/17/seats?section=A
```

```json
{
  "event_id": 17,
  "as_of": "2026-10-20T10:00:03Z",
  "seats": [
    {
      "id": 1201,
      "section": "A",
      "row": "12",
      "number": 5,
      "price_cents": 500000,
      "status": "available"
    },
    {
      "id": 1202,
      "section": "A",
      "row": "12",
      "number": 6,
      "price_cents": 500000,
      "status": "held"
    }
  ]
}
```

The seat map can be a few seconds old. The hold request is what decides who gets a seat.

### Hold seats

```http
POST /v1/events/17/holds
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
X-Admission-Token: adm_8f3k2...
Idempotency-Key: 6c1d9a52-0a47-4b0e-9f12-5e7b2d1c8a90
Content-Type: application/json
```

```json
{ "seat_ids": [1201, 1203] }
```

**Response: 201 Created**

```json
{
  "order_id": 9001,
  "status": "pending",
  "event_id": 17,
  "seats": [
    {
      "id": 1201,
      "section": "A",
      "row": "12",
      "number": 5,
      "price_cents": 500000
    },
    {
      "id": 1203,
      "section": "A",
      "row": "12",
      "number": 7,
      "price_cents": 500000
    }
  ],
  "total_cents": 1000000,
  "currency": "KES",
  "expires_at": "2026-10-20T10:08:00Z"
}
```

If any one of the seats is already taken, **none** are held, and the response is a 409 (see the error codes below).

### Pay

```http
POST /v1/orders/9001/payments
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Idempotency-Key: 0b8e47c1-52d9-4c7e-a1f3-9d2c6e5b7a14
Content-Type: application/json
```

```json
{ "payment_token": "tok_9f2a71c3" }
```

The `payment_token` comes from the payment provider's own card form, so card numbers never reach TicketHub's servers.

**Response: 201 Created**

```json
{
  "order_id": 9001,
  "status": "paid",
  "tickets": [
    {
      "id": 55001,
      "code": "TH-7K2M-9QXA",
      "section": "A",
      "row": "12",
      "number": 5
    },
    {
      "id": 55002,
      "code": "TH-3PD8-V1LC",
      "section": "A",
      "row": "12",
      "number": 7
    }
  ]
}
```

### Error codes

Every error uses the same shape:

```json
{
  "error": {
    "status": 409,
    "code": "SEAT_UNAVAILABLE",
    "message": "Seat A12-5 was just taken. Please choose another seat.",
    "details": [{ "seat_id": 1201 }]
  }
}
```

| Status                  | Code                                           | When it happens                                                                                               |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 400 Bad Request         | `VALIDATION_ERROR`                             | More than 4 seats, no seats chosen, or a malformed body                                                       |
| 401 Unauthorized        | `UNAUTHORIZED`                                 | The bearer token is missing or expired                                                                        |
| 403 Forbidden           | `NOT_ADMITTED`                                 | No valid admission token (the user has not yet passed the waiting room), or the order belongs to someone else |
| 404 Not Found           | `NOT_FOUND`                                    | The event, order or seat does not exist                                                                       |
| 409 Conflict            | `SEAT_UNAVAILABLE`, `SOLD_OUT`, `HOLD_EXPIRED` | A seat was taken by someone else, the event is sold out, or the 8-minute hold ran out before payment          |
| 429 Too Many Requests   | `RATE_LIMITED`                                 | Too many requests from one user or IP address (with a `Retry-After` header)                                   |
| 503 Service Unavailable | `TRY_AGAIN`                                    | The system is shedding load, so the client waits and retries (with a `Retry-After` header)                    |

## 4. Data model

### 4.1 Tables

| Table     | What a row is                               | Primary key | Foreign keys                                           | Key rules                                                                                                             |
| --------- | ------------------------------------------- | ----------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `users`   | One customer                                | `id`        | none                                                   | `email` is UNIQUE                                                                                                     |
| `events`  | One concert or event                        | `id`        | none                                                   | `total_seats` must be above 0                                                                                         |
| `orders`  | One purchase attempt by a user for an event | `id`        | `user_id` to `users`, `event_id` to `events`           | `status` is pending, paid, cancelled or expired. `UNIQUE (user_id, idempotency_key)` and a UNIQUE `payment_reference` |
| `seats`   | One physical seat for one event             | `id`        | `event_id` to `events`, `held_by_order_id` to `orders` | `status` is available, held or sold. `UNIQUE (event_id, section, row_label, seat_number)`                             |
| `tickets` | One issued ticket                           | `id`        | `order_id` to `orders`, `seat_id` to `seats`           | **`seat_id` is UNIQUE**, so a seat can only ever have one ticket                                                      |

### 4.2 Relationships

- **One-to-many: events to seats.** An event has thousands of seats, and each seat row belongs to one event.
- **One-to-many: users to orders** and **events to orders.** A user can place many orders, and an event has many orders. Together, `orders` links users and events in a **many-to-many** way: one user can buy for many events, and one event has many buyers.
- **One-to-many: orders to tickets.** An order has one or more tickets.
- **One-to-one: seats to tickets.** A seat has at most one ticket, which the `UNIQUE (seat_id)` rule enforces.
- **Orders and seats are many-to-many** over time. An order can hold several seats, and a seat can be held by different orders at different times, but never by two at once. The `held_by_order_id` column records the current hold, and `tickets` records the permanent result.

### 4.3 CREATE TABLE statements

These use SQLite syntax so they can be tested in sqliteonline.com. In PostgreSQL, the production database, `id` would be `BIGINT GENERATED ALWAYS AS IDENTITY` and timestamps would be `TIMESTAMPTZ`.

```sql
PRAGMA foreign_keys = ON;   -- SQLite only

-- Reset so the file can be run again (children before parents)
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS seats;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id             INTEGER PRIMARY KEY,
  title          TEXT NOT NULL,
  venue          TEXT NOT NULL,
  starts_at      TEXT NOT NULL,
  sale_starts_at TEXT NOT NULL,
  total_seats    INTEGER NOT NULL CHECK (total_seats > 0),
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE orders (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL,
  event_id          INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
  total_cents       INTEGER NOT NULL CHECK (total_cents >= 0),
  idempotency_key   TEXT NOT NULL,
  payment_reference TEXT UNIQUE,
  expires_at        TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, idempotency_key),      -- a retried request cannot create a second order
  FOREIGN KEY (user_id)  REFERENCES users(id),
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE seats (
  id               INTEGER PRIMARY KEY,
  event_id         INTEGER NOT NULL,
  section          TEXT NOT NULL,
  row_label        TEXT NOT NULL,
  seat_number      INTEGER NOT NULL,
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  status           TEXT NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available', 'held', 'sold')),
  held_by_order_id INTEGER,
  hold_expires_at  TEXT,
  UNIQUE (event_id, section, row_label, seat_number),   -- the same seat cannot exist twice
  CHECK (status = 'available' OR held_by_order_id IS NOT NULL),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (held_by_order_id) REFERENCES orders(id)
);

CREATE TABLE tickets (
  id        INTEGER PRIMARY KEY,
  order_id  INTEGER NOT NULL,
  seat_id   INTEGER NOT NULL UNIQUE,     -- FINAL GUARD: one seat, one ticket, ever
  code      TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (seat_id)  REFERENCES seats(id)
);
```

### 4.4 Indexes

```sql
CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_seats_hold_expiry  ON seats (hold_expires_at) WHERE status = 'held';
CREATE INDEX idx_orders_user        ON orders (user_id, created_at DESC);
CREATE INDEX idx_tickets_order      ON tickets (order_id);
```

- `idx_seats_event_status` makes "which seats are available for this event?" fast, which powers the seat map and the sold-out check.
- `idx_seats_hold_expiry` is a partial index that covers only held seats. The clean-up job that returns expired holds to sale reads just those few rows instead of scanning every seat.
- `idx_orders_user` makes "my orders, newest first" fast.
- `idx_tickets_order` makes "the tickets in this order" and "my tickets" fast.

### 4.5 How double-booking is prevented

Two people must never end up with the same seat. I do not rely on one safeguard. Each layer below catches what the one before it might miss.

**Layer 1: a fast filter (not the guarantee).** The waiting room limits how many people are shopping at once, and a Redis gate (`SET seat:17:1201 order-9001 NX EX 480`) lets only one request win a seat. `NX` means "only set if it does not already exist", and Redis does this as one atomic step. This rejects most of the losers cheaply, so the database is not flooded. Redis is only a filter, because it can lose data if it restarts, so the database makes the real decision.

**Layer 2: one atomic update in a transaction (the real guarantee).** The database checks and changes the seat in a single statement, never "look first, then update", because a gap between looking and updating is where double-booking bugs come from:

```sql
UPDATE seats
SET status = 'held', held_by_order_id = :order_id, hold_expires_at = :expires_at
WHERE id = :seat_id
  AND event_id = :event_id
  AND (status = 'available' OR (status = 'held' AND hold_expires_at < CURRENT_TIMESTAMP));
-- 1 row changed: the seat is mine.  0 rows changed: someone else got it.
```

PostgreSQL locks a row while it is being updated. If two people hit the same seat at the same instant, the second update waits, then re-checks the `WHERE` condition against the first person's committed change, sees the seat is no longer available, and changes 0 rows. The server then answers `409 SEAT_UNAVAILABLE`.

**Layer 3: all-or-nothing orders.** A hold for 2 or 3 seats runs inside one transaction. If any seat returns 0 rows, the whole transaction is rolled back and the person gets none of them, so nobody is left holding half a group. Seats are updated in order of `id`, so two people holding overlapping seats cannot deadlock each other.

**Layer 4: holds expire.** A hold lasts 8 minutes (`hold_expires_at`). The hold update treats an expired hold as available, so correctness never depends on a clean-up job running on time. A background worker also returns expired holds to sale every 30 seconds so the seat map stays accurate.

**Layer 5: paying is another atomic step.** When the payment succeeds, one transaction does three things: it changes the seats from held to sold, creates the tickets and marks the order paid. The seat update only succeeds if the hold is still valid and still belongs to this order:

```sql
UPDATE seats
SET status = 'sold'
WHERE held_by_order_id = :order_id AND status = 'held' AND hold_expires_at >= CURRENT_TIMESTAMP;
-- the number of rows changed must equal the number of seats in the order, otherwise roll back
```

When payment starts, the hold is extended by 2 minutes so it cannot run out mid-payment. If a payment still succeeds after the hold is lost, the payment is refunded automatically and the customer gets a clear message.

**Layer 6: the constraint is the last line of defence.** `tickets.seat_id` is `UNIQUE`. Even if there were a bug in my code, or a rare race I did not predict, the database itself refuses to create a second ticket for the same seat. The failed transaction is rolled back and the payment is refunded.

**Layer 7: retries cannot duplicate anything.** A double-click, a flaky connection or a retried request carries the same `Idempotency-Key`. `UNIQUE (user_id, idempotency_key)` on orders and a `UNIQUE` payment reference stop a second order or a second charge.

**Timeline: Amina and Brian click the same seat in the same millisecond**

| Step | Amina's request                               | Brian's request                                                 |
| ---- | --------------------------------------------- | --------------------------------------------------------------- |
| 1    | Reaches the Redis gate first, wins the seat   | Reaches the Redis gate second, loses and gets 409 straight away |
| 2    | Runs the conditional UPDATE and changes 1 row | Never reaches the database                                      |
| 3    | Holds the seat for 8 minutes and pays         | Sees the seat as taken and picks another                        |

If Redis were down, Brian's request would reach the database anyway. His UPDATE would wait for Amina's, find the seat already held, and change 0 rows. The result is the same, just slower, so the correctness never depended on Redis.

**Try it yourself** in sqliteonline.com. First run the CREATE TABLE and index statements, then this sample data and demo (in a real server, the values are placeholders, never joined into the SQL text):

```sql
INSERT INTO users (id, name, email, password_hash) VALUES
  (1, 'Amina Wanjiru', 'amina@example.com', 'hash1'),
  (2, 'Brian Otieno',  'brian@example.com', 'hash2');

INSERT INTO events (id, title, venue, starts_at, sale_starts_at, total_seats) VALUES
  (1, 'Nairobi Live Concert', 'Kasarani Stadium', '2026-12-12 19:00:00', '2026-10-20 10:00:00', 3);

INSERT INTO orders (id, user_id, event_id, total_cents, idempotency_key, expires_at) VALUES
  (1, 1, 1, 500000, 'key-amina-1', '2099-01-01 00:00:00'),
  (2, 2, 1, 500000, 'key-brian-1', '2099-01-01 00:00:00');

INSERT INTO seats (id, event_id, section, row_label, seat_number, price_cents) VALUES
  (1, 1, 'A', '1', 1, 500000),
  (2, 1, 'A', '1', 2, 500000),
  (3, 1, 'A', '1', 3, 500000);
```

```sql
-- Amina (order 1) tries to hold seat 1
UPDATE seats SET status = 'held', held_by_order_id = 1, hold_expires_at = '2099-01-01 00:00:00'
WHERE id = 1 AND event_id = 1
  AND (status = 'available' OR (status = 'held' AND hold_expires_at < CURRENT_TIMESTAMP));
SELECT changes();   -- expected: 1 (Amina got the seat)

-- Brian (order 2) tries the same seat a moment later
UPDATE seats SET status = 'held', held_by_order_id = 2, hold_expires_at = '2099-01-01 00:00:00'
WHERE id = 1 AND event_id = 1
  AND (status = 'available' OR (status = 'held' AND hold_expires_at < CURRENT_TIMESTAMP));
SELECT changes();   -- expected: 0 (Brian is refused)

-- Amina pays: the seat becomes sold and a ticket is created
UPDATE seats SET status = 'sold'
WHERE held_by_order_id = 1 AND status = 'held' AND hold_expires_at >= CURRENT_TIMESTAMP;
INSERT INTO tickets (order_id, seat_id, code) VALUES (1, 1, 'TKT-AAA');

-- The final guard: a second ticket for the same seat
-- Run this one on its own. expected: ERROR  UNIQUE constraint failed: tickets.seat_id
INSERT INTO tickets (order_id, seat_id, code) VALUES (2, 1, 'TKT-BBB');
```

**Useful queries**

```sql
-- My tickets (what GET /me/tickets runs for user 1)
SELECT tickets.code, seats.section, seats.row_label, seats.seat_number
FROM tickets
JOIN orders ON orders.id = tickets.order_id
JOIN seats  ON seats.id  = tickets.seat_id
WHERE orders.user_id = 1;
-- expected: TKT-AAA, A, 1, 1

-- How many seats are in each state for an event
SELECT status, COUNT(*) AS seat_count
FROM seats
WHERE event_id = 1
GROUP BY status;
-- expected: available 2, sold 1

-- The clean-up job: return expired holds to sale
UPDATE seats
SET status = 'available', held_by_order_id = NULL, hold_expires_at = NULL
WHERE status = 'held' AND hold_expires_at < CURRENT_TIMESTAMP;
```

## 5. Architecture

```
 +--------------+   1. DNS lookup       +----------------------------+
 |              |---------------------->| DNS  tickethub.com -> IP   |
 |  Client      |                       +----------------------------+
 | web / mobile |
 |              |   2. static files     +----------------------------+
 |              |---------------------->| CDN + bot protection (WAF) |
 +--------------+                       +----------------------------+
        |
        | 3. API calls (HTTPS, JSON)
        |
        v
 +--------------------------------------------------+
 | Load balancer                                    |
 | rate limiting, health checks                     |
 +--------------------------------------------------+
         |                         |
         v                         v
 +---------------+  +------------------------------+      +------------------+
 | Waiting room  |  | App servers (x N)            |----->| Payment provider |
 | service       |  | stateless, pre-scaled        |      | (external)       |
 +---------------+  +------------------------------+      +------------------+
        |             |          |                |
        |             |          |                |
        v             v          v                v
 +----------------------+  +-------------+  +-------------+
 | Cache (Redis)        |  | Primary DB  |  | Queue       |
 | seat map, seat gate, |  | (the truth) |  | (jobs)      |
 | waiting-room queue   |  +-------------+  +-------------+
 +----------------------+        |                |
                                 | replication    |
                                 v                v
                           +-------------+  +----------------+
                           | Read replica|  | Workers        |
                           | (browsing)  |  | (emails etc.)  |
                           +-------------+  +----------------+
```

How to read it:

- The browser looks up the name with DNS and loads the website files from the CDN, so those requests never reach our servers.
- API calls go through the load balancer to either the waiting room or the app servers.
- App servers use Redis for the seat map and the seat gate, write to the primary database, read browsing data from the read replica, call the payment provider, and add jobs to the queue.
- The waiting room keeps people's places in Redis.
- Workers take jobs from the queue and write results to the database.

### Components: the problem each one solves

- **Client:** The website or mobile app shows events and seats and sends the API calls, which keeps the work of drawing pages on the user's own device.
- **DNS:** Turns `tickethub.com` into the addresses of our servers, so users never need to know them and we can move servers without changing the name.
- **CDN with bot protection (WAF):** Serves the website files, images and event pages from a server near the user, which keeps thousands of requests off our servers, and filters out bots and scalpers before they reach us.
- **Load balancer:** Spreads requests across servers and stops sending traffic to any that fail a health check, which solves overload and a single server crashing, and applies rate limits per user and IP address.
- **Waiting room service:** Holds the crowd in a queue and admits about 200 people per second, which solves the database being flattened by 200,000 people at once and makes the sale fair. It is separate from the app servers, so a flood of waiting people cannot starve people who are paying.
- **App servers:** Run the TicketHub logic (browsing, holding seats, payments) and are stateless, so we can add more servers before a sale and replace any that fail.
- **Cache (Redis):** Keeps the seat map in fast memory, runs the atomic seat gate and stores the waiting-room positions, which solves 25,000 seat-map reads per second hitting the database and rejects most losing hold attempts cheaply.
- **Primary database (PostgreSQL):** The one source of truth for seats, orders and tickets, whose transactions and constraints solve the problem of two people buying the same seat.
- **Read replica:** A live copy of the primary that answers browsing queries, which solves browsing traffic slowing down the primary while it is busy selling.
- **Queue:** Holds slow jobs such as "send ticket email" until a worker is free, which solves slow work making the buyer wait and protects the payment flow from email delays.
- **Workers:** Take jobs off the queue (ticket emails, returning expired holds to sale, sending payment confirmations), which solves heavy or slow tasks running inside the buyer's request.
- **Payment provider (external):** Takes the card details and charges the card, which solves the security and legal burden of handling card numbers ourselves.

### How the design survives the big sale

1. **Scale up before the sale, not during it.** New servers take minutes to start, so I add capacity ahead of the on-sale time. As a rough guess, one app server handles about 1,000 simple requests per second, so I plan about 6 app servers and about 10 small waiting-room servers, and then double that to be safe, with autoscaling above.
2. **The CDN absorbs the rush for pages.** The event page, images and the website files are the same for everyone, so none of that reaches our servers.
3. **The waiting room turns a spike into a steady stream.** The queue opens before the sale starts. People who join before 10:00 are shuffled into a random order, and later arrivals queue behind them in order of arrival. About 200 people per second get an admission token, which is a signed token the app servers can check without calling the database.
4. **Seat-map reads come from Redis.** Only admitted shoppers read the seat map, at about 4,000 requests per second. Redis answers them from memory, and the map is allowed to be a few seconds old.
5. **Redis filters, the database decides.** Of the 5,000 hold attempts per second at the peak, only the winners (about 200 per second) reach the database, which is easy work for PostgreSQL.
6. **Sold out is answered from the cache.** When the available-seat counter in Redis reaches zero, the app servers answer `409 SOLD_OUT` straight away without touching the database. The counter is only approximate, and the database is still the truth.
7. **Slow work goes to the queue.** Emails and clean-up never slow down a purchase.
8. **Overload protection.** Rate limits return `429`, timeouts stop requests waiting on slow services, retries use back-off (1 second, then 2, then 4), and if the system must shed load it returns `503` with `Retry-After`. If something non-essential such as recommendations fails, people can still pick seats and pay.

### The buying flow

1. The person opens the event page (served by the CDN) and joins the waiting room.
2. The client checks its place every 10 seconds (with a little random delay so checks do not arrive together).
3. When their turn comes, the waiting room gives them an admission token.
4. The client loads the seat map (from Redis) and the person picks seats.
5. `POST /events/{id}/holds`: the app server checks the token, tries the Redis gate, then runs the atomic update in one transaction and creates a pending order. The response is `201` with an expiry time, or `409` if a seat is gone.
6. `POST /orders/{id}/payments`: the app server extends the hold, charges the payment token, then runs one transaction that marks the seats sold, creates the tickets and marks the order paid.
7. A job is added to the queue, and a worker emails the tickets.
8. The person sees their tickets under `GET /me/tickets`.

### What happens when something fails

| If this fails            | What happens                                                                                                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An app server            | The load balancer's health check removes it within seconds. Servers are stateless, so no data is lost, and the client retries on another server.                                                                                              |
| Redis                    | App servers skip the gate and go straight to the database, and the waiting room admits fewer people per second. Correctness is not affected, because the database was always the decision-maker. A replica of Redis takes over automatically. |
| The primary database     | A replica is promoted to primary. Paid orders are safe because every commit is replicated before it is confirmed. Holds in progress may expire, so those people can try again.                                                                |
| A read replica           | Browsing reads go to the primary or another replica.                                                                                                                                                                                          |
| The queue or a worker    | Jobs stay in the queue and are retried. Emails arrive late, but tickets are still shown in the account. Jobs that keep failing go to a dead-letter queue for a person to inspect.                                                             |
| The payment provider     | Holds are extended and the person is told that payment is temporarily unavailable. Nobody is charged without a ticket.                                                                                                                        |
| The load balancer or DNS | A managed load balancer across several zones and a DNS provider with several name servers avoid a single point of failure.                                                                                                                    |

## 6. Trade-offs

1. **Fast seat map versus exact seat map.** The seat map comes from Redis and may be a few seconds old, so someone can click a seat that was just taken. That is a small annoyance, because the hold request checks the database and answers with a friendly 409. The alternative, reading the seat map from the primary database every time, would be exact but far too slow and expensive at 25,000 requests per second.
2. **The waiting room: protection and fairness versus waiting.** The waiting room keeps the system alive and gives everyone a fair place, but 180,000 people spend several minutes in line only to be told "sold out", and it adds a component to build and run. Admitting more people per second shortens the wait but puts more load on the database. At 200 per second the 20,000 seats can all be held within about a minute (roughly 10,000 orders of 2 seats), and anyone who gets a seat after an expiry has queued fairly.
3. **Random order versus first come, first served.** Shuffling everyone who joins before the sale opens is fair to people on slow connections and stops bots from winning by being fastest, but some people feel that arriving early should count for more. I chose the shuffle for the early joiners, and arrival order for everyone after.
4. **Hold length: 8 minutes.** A short hold returns abandoned seats to sale quickly, which is fairer to people waiting. A long hold gives people time to find their card and pay but lets people sit on seats. I chose 8 minutes and extend it by 2 minutes once payment starts.
5. **Redis plus the database versus the database alone.** Two systems means more complexity and more things that can fail, but it protects the database from 5,000 hold attempts per second. Because the database stays the only source of truth, a Redis failure slows the sale down but cannot cause a double sale.
6. **One primary database versus sharding.** One primary keeps seats and orders strongly consistent and is simple to run, but all writes go through it. At about 200 hold transactions per second after the waiting room, this is well within what one PostgreSQL server can do, so I scale up first and would only split events across several databases (sharding by `event_id`) if a single sale grew far beyond 20,000 seats.
