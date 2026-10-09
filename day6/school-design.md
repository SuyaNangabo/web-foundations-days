# School Database Design

This document explains the design of my school database in `school.sql`. It has three tables: `students`, `courses` and `enrolments`.

## Setup in the file

At the top of `school.sql` I drop the tables with `DROP TABLE IF EXISTS`, so I can run the file again without a "table already exists" error. I drop `enrolments` first because it depends on the other two tables. I also run `PRAGMA foreign_keys = ON;` because SQLite does not enforce foreign keys unless it is switched on.

## Tables

### students

| Column  | Type    | Rules            |
| ------- | ------- | ---------------- |
| `id`    | INTEGER | PRIMARY KEY      |
| `name`  | TEXT    | NOT NULL         |
| `email` | TEXT    | NOT NULL, UNIQUE |

This table stores one row per student. The `id` identifies each student. Every student must have a name and an email, so both are `NOT NULL`. The email is `UNIQUE` so two students cannot register with the same address.

### courses

| Column    | Type    | Rules       |
| --------- | ------- | ----------- |
| `id`      | INTEGER | PRIMARY KEY |
| `title`   | TEXT    | NOT NULL    |
| `credits` | INTEGER | NOT NULL    |

This table stores one row per course. Every course needs a title and a number of credits, so both are `NOT NULL`.

### enrolments

| Column       | Type    | Rules                                        |
| ------------ | ------- | -------------------------------------------- |
| `id`         | INTEGER | PRIMARY KEY                                  |
| `student_id` | INTEGER | NOT NULL, FOREIGN KEY to `students(id)`      |
| `course_id`  | INTEGER | NOT NULL, FOREIGN KEY to `courses(id)`       |
| `grade`      | INTEGER | CHECK (grade BETWEEN 0 AND 100), can be NULL |

This table records the fact that a student is enrolled on a course. Each row is one student on one course.

- `student_id` and `course_id` are `NOT NULL` because an enrolment must always link a real student to a real course.
- `grade` is allowed to be `NULL` because a student has no grade until they are marked. When it has a value, the `CHECK` rule keeps it between 0 and 100.
- `UNIQUE (student_id, course_id)` stops the same student enrolling on the same course twice.
- Both foreign keys use `ON DELETE CASCADE`. If a student or course is deleted, their enrolments are deleted automatically, so no enrolment is left pointing at something that no longer exists.

## Relationships

**One-to-many:** One student can have many enrolments, and one course can have many enrolments. But each enrolment belongs to exactly one student and exactly one course. These two one-to-many links are the two foreign keys in `enrolments`.

**Many-to-many:** Students and courses are many-to-many. One student can take many courses (Amina takes all three in my data), and one course can have many students (Web Foundations has Amina, Brian and Cynthia).

**Why a join table is needed:** Neither `students` nor `courses` can hold this link on its own. If I put a list of courses in one student column, such as "1,2,3", it would be hard to search and update. If I added one course column to `students`, a student could only take one course. The `enrolments` table solves this by storing one row per student-course pair. It is also the right place to keep information about the link itself, which is the `grade`.

## Sample data

I inserted 4 students, 3 courses and 6 enrolments. I inserted the students and courses first, because enrolments point at them. David Kamau has no enrolments on purpose, so I can test the "students with no enrolments" query. Brian's enrolment on JavaScript Basics has a `NULL` grade, which shows a student who has not been marked yet.

## Queries

1. **All courses for one student (by name):** I `JOIN` students to enrolments and then enrolments to courses, and filter with `WHERE students.name = 'Amina Wanjiru'`. It returns her three courses with their grades.
2. **All students on one course:** The same two `JOIN`s from the other direction, filtered with `WHERE courses.title = 'Web Foundations'`. It returns Amina, Brian and Cynthia.
3. **Number of students per course:** I use `LEFT JOIN` with `COUNT(enrolments.id)` and `GROUP BY courses.id`. `GROUP BY` makes one group per course so the count happens inside each group. `LEFT JOIN` means a course with no students would still appear with a count of 0.
4. **Students who have no enrolments:** I `LEFT JOIN` students to enrolments and keep only rows where `enrolments.id IS NULL`. A plain `JOIN` would drop these students, so `LEFT JOIN` is needed. It returns David Kamau.
5. **Update one enrolment's grade:** `UPDATE enrolments SET grade = 88 WHERE student_id = 2 AND course_id = 3;` changes Brian's grade on JavaScript Basics. The `WHERE` is important, because without it every grade in the table would change. I added a `SELECT` straight after to check that the update worked.

## Index

I added `CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);`.

Questions like "which students are on this course?" (query 2) and "how many students per course?" (query 3) look rows up by `course_id`. The `UNIQUE (student_id, course_id)` rule already gives a fast lookup by student, but not by course. Without this index, the database would have to scan every row in `enrolments`. The cost is a little extra storage and slightly slower inserts, which is a good trade for a system that reads data much more often than it writes it.

## SQL or NoSQL?

I would choose SQL for this system. School data is structured and full of relationships between students, courses and enrolments, and I need to join them and count them, as my queries show. A relational database also keeps the data correct: foreign keys stop an enrolment pointing at a student or course that does not exist, `NOT NULL`, `UNIQUE` and `CHECK` stop bad values, and transactions let several changes succeed or fail together. A NoSQL document database is better when the data has a flexible shape that changes often. Here the shape is fixed and the links between records matter most, which is what a relational database does best.
