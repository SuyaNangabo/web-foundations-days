# Library Books REST API Design

A RESTful API specification for managing a library's book catalog and inventory.

---

## Endpoints

### 1. List All Books

- **Method:** `GET`
- **Path:** `/books`
- **Description:** Retrieves a complete list of all books in the library catalog.
- **Success Status Code:** `200 OK`

---

### 2. Get a Single Book

- **Method:** `GET`
- **Path:** `/books/:id`
- **Description:** Retrieves details of a specific book by its ID.
- **Success Status Code:** `200 OK`

---

### 3. Create a Book

- **Method:** `POST`
- **Path:** `/books`
- **Description:** Adds a new book to the library catalog.
- **Request Body (JSON):**
  ```json
  {
    "title": "The River and the Source",
    "author": "Margaret Ogola",
    "isbn": "9789966882059",
    "publishedYear": 1994,
    "availableCopies": 10
  }
  ```
