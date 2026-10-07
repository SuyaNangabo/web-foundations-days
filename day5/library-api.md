# Kenya National Library REST API Specification

This document outlines the REST API design for managing the library's book catalog and inventory.

---

## Resource Endpoints (`/books`)

### 1. List All Books

- **Method:** `GET`
- **Path:** `/books`
- **Description:** Retrieves a complete list of all books in the library catalog.
- **Success Status Code:** `200 OK`

---

### 2. Get a Single Book

- **Method:** `GET`
- **Path:** `/books/:id`
- **Description:** Retrieves the details of a specific book using its unique ID.
- **Success Status Code:** `200 OK`

---

### 3. Create a Book

- **Method:** `POST`
- **Path:** `/books`
- **Description:** Adds a brand-new book to the library catalog.
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
