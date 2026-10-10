# SnapShare Scaling Plan

SnapShare is a photo-sharing app where users upload photos and scroll a feed of photos from the people they follow. This plan estimates the load and designs a system that can handle it.

## 1. Assumptions

- There are 10,000,000 registered users.
- 10% of them are active each day.
- Each active user uploads 1 photo per day and views 50 feed pages per day.
- An average photo is 2 MB, and each photo also gets a 50 KB thumbnail.
- One day is about 100,000 seconds (a rounded version of 86,400, to make the maths easy).
- Peak traffic is 5 times the average.
- I use decimal units (1 TB = 1,000,000 MB) and a year of 365 days.
- The database stores about 1 KB of information (user, time, caption, file location) per photo. This is my own assumption.

**Daily active users:** 10,000,000 × 10% = **1,000,000 users per day**

## 2. Estimates

**Uploads per second**

- Uploads per day: 1,000,000 users × 1 photo = 1,000,000
- Average: 1,000,000 ÷ 100,000 = **10 uploads per second**
- Peak: 10 × 5 = **50 uploads per second**

**Feed views per second**

- Feed views per day: 1,000,000 users × 50 pages = 50,000,000
- Average: 50,000,000 ÷ 100,000 = **500 feed views per second**
- Peak: 500 × 5 = **2,500 feed views per second**

**Photo storage per year**

- Originals per day: 1,000,000 × 2 MB = 2,000,000 MB = 2 TB
- Thumbnails per day: 1,000,000 × 50 KB = 50 GB
- Total per day: about 2.05 TB
- Total per year: 2.05 TB × 365 = about 748 TB, so **roughly 750 TB per year** (about 0.75 PB)

**Extra numbers I worked out**

- Upload bandwidth: 10 × 2 MB = 20 MB per second on average, and 100 MB per second at peak.
- Database metadata: 1,000,000 × 1 KB = 1 GB per day, about 365 GB per year. This is small enough for one database.

| Measure                | Average      | Peak (5×) |
| ---------------------- | ------------ | --------- |
| Uploads per second     | 10           | 50        |
| Feed views per second  | 500          | 2,500     |
| Photo storage per year | about 750 TB | -         |

## 3. Read-heavy or write-heavy?

SnapShare is **read-heavy**. There are 500 feed views per second but only 10 uploads per second, so there are about 50 reads for every write.

This changes the design in three ways:

- I should make reads fast and cheap by using a **cache** and a **CDN** so most requests never reach the database.
- I should add a **read replica** so feed reads are spread away from the main database, which handles the writes.
- Writes are less frequent, but each one is large (2 MB), so photo files must go to storage built for big files, and slow work like thumbnails should run in the background.

## 4. Why photos should not be stored in the database

Photos should not be stored inside the database for these reasons:

- At about 750 TB per year, photo files would make the database huge, and databases are expensive to store and scale at that size.
- Large files slow down queries, backups and replication, which hurts the whole app.
- A database is designed for small, structured rows, not for streaming large files to users.
- A CDN cannot easily serve files that sit inside a database.

Instead, photos go into **object storage** (such as Amazon S3), which is cheap, very durable and built for huge numbers of files. The database stores only a small row for each photo, including the **file location (key)** in object storage. The CDN then delivers the files to users.

### Architecture diagram

```
                    Users (web / mobile apps)
                      |                   |
          photo files |                   | API requests
                      v                   v
               +-------------+     +----------------+
               |     CDN     |     | Load Balancer  |
               +------+------+     +--------+-------+
                      |                     |
               (cache miss)                 v
                      |           +--------------------+
                      |           |    App Servers     |
                      |           |  (stateless, x N)  |
                      |           +---+----+----+---+--+
                      |               |    |    |   |
                      |      +--------+    |    |   +----------+
                      |      v             v    v              v
                      |  +-------+   +---------+ +-----------+ +-------+
                      |  | Cache |   | Primary | |   Read    | | Queue |
                      |  |(Redis)|   |   DB    | |  Replica  | +---+---+
                      |  +-------+   | (writes)| |  (reads)  |     |
                      |              +----+----+ +-----^-----+     v
                      |                   |  replication |    +---------+
                      |                   +--------------+    | Worker  |
                      |                                       |(thumbs) |
                      v                                       +----+----+
               +----------------+                                  |
               | Object Storage |<---------------------------------+
               | originals +    |
               | thumbnails     |
               +----------------+
```

How to read the diagram:

- App servers upload each original photo to Object Storage.
- App servers read the feed from the Cache first, then from the Read Replica.
- App servers write new photo rows to the Primary DB, which copies them to the Read Replica.
- App servers add a "make thumbnail" job to the Queue, and the Worker saves the thumbnail to Object Storage.
- When a user opens the feed, the CDN delivers the photo files from nearby. On a cache miss, the CDN fetches them from Object Storage.

## 5. What each component does

- **CDN:** Stores copies of photos and thumbnails near users around the world, which solves slow image loading and takes load off our servers.
- **Load balancer:** Spreads incoming requests across many app servers, which solves one server being overloaded and lets the system carry on if a server crashes.
- **App servers:** Run the application logic, such as checking logins, handling uploads and building feeds, and because they are stateless I can add more of them as traffic grows.
- **Cache (Redis):** Keeps popular data like recent feeds in fast memory, which solves the database being hit by the same read requests again and again.
- **Primary database:** Stores the users, follows and photo information and handles all writes, which solves the need for one reliable source of truth.
- **Read replica:** Holds a copy of the primary database that serves read queries, which solves the read load of 500 to 2,500 feed views per second overwhelming one database.
- **Object storage:** Stores the photo files themselves cheaply and durably, which solves the problem of keeping hundreds of terabytes of images out of the database.
- **Queue:** Holds "create a thumbnail" jobs until a worker is free, which solves slow background work making uploads wait and stops jobs being lost if a worker is busy or crashes.
- **Worker:** Takes jobs from the queue and creates the 50 KB thumbnails, which solves the heavy image processing being done inside the upload request.

## 6. Upload flow, step by step

1. The user picks a photo in the app, and the app sends the upload request to the **load balancer** along with the user's login token.
2. The load balancer sends the request to one of the **app servers**.
3. The app server checks that the user is logged in and that the file is a valid photo of an allowed size.
4. The app server saves the original 2 MB photo in **object storage** and gets back its file location.
5. The app server writes a row in the **primary database** with the photo's id, the user's id, the file location, the time, and a status of "processing". The primary database copies this row to the **read replica**.
6. The app server adds a "create thumbnail" job (photo id and file location) to the **queue**.
7. The app server tells the user the upload worked, without waiting for the thumbnail.
8. A **worker** takes the job from the queue, downloads the original from object storage, makes a 50 KB thumbnail, and saves it back to object storage.
9. The worker updates the database row to say the thumbnail is ready.
10. If the worker fails or crashes before finishing, the job is not marked as done, so it goes back on the queue and is tried again. After a set number of failed attempts, the job moves to a "dead letter" queue so a person can look at it, and the photo keeps showing a placeholder instead of a thumbnail.
11. The app server clears the cached feeds that should now include the new photo, so followers see it next time they refresh. Because the read replica can lag slightly behind the primary, the uploader's own feed is read from the primary for a short time, so they always see their own photo straight away.
12. The photo and thumbnail are delivered to users through the **CDN**, which fetches them from object storage on the first request and keeps a copy nearby for the next ones.

## 7. Trade-offs

1. **Read replica: speed versus freshness.** A read replica lets me handle many more feed reads, but the copy can lag a moment behind the primary. A new photo might not show up in a follower's feed for a short time. This is acceptable for a photo feed, but it would not be for something like a bank balance. This lag is also a failure point to monitor, because if the replica falls far behind, users would see old feeds.
2. **Cache: speed versus stale data.** Caching makes feeds load fast and protects the database, but the cached copy can be out of date, and I have to clear or expire it correctly after changes. This adds complexity and a risk of showing old data if a clear step is missed, so I would also give cached feeds a short expiry time as a safety net.
3. **Queue and worker: fast uploads versus delayed thumbnails.** Making thumbnails in the background keeps uploads fast, but the thumbnail is not ready the instant the user uploads, so I would show a placeholder until it is ready. It also adds more parts to run and watch, including retries and a dead letter queue for jobs that keep failing.
4. **Object storage and CDN: cost versus speed.** Storing about 750 TB per year and serving it from a CDN costs real money, but it is far cheaper and faster than keeping photos in the database. I could reduce the cost by moving old photos to cheaper storage.
