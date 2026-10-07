# Library Books REST API Design

A RESTful API specification for managing books in a library.

---

## Endpoints

### 1. List All Books

- **Method:** `GET`
- **Path:** `/books`
- **Description:** Retrieves a list of all books in the catalog.
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
    "title": "Things Fall Apart",
    "author": "Chinua Achebe",
    "isbn": "9780385474542",
    "publishedYear": 1958
  }
  ```
