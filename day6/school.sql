-- Day 6: School database (students, courses, enrolments)

-- Reset so the file can be run again without "table already exists" errors.
-- Order matters: enrolments depends on the other two, so it is dropped first.
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS students;

-- SQLite only enforces foreign keys when this is switched on
PRAGMA foreign_keys = ON;

-- ===== 1. Tables =====
CREATE TABLE students (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE          -- no two students can share an email
);

CREATE TABLE courses (
  id      INTEGER PRIMARY KEY,
  title   TEXT NOT NULL,
  credits INTEGER NOT NULL
);

-- Join table: one row = one student enrolled on one course
CREATE TABLE enrolments (
  id         INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  course_id  INTEGER NOT NULL,
  grade      INTEGER CHECK (grade BETWEEN 0 AND 100),   -- NULL until marked
  UNIQUE (student_id, course_id),     -- same student cannot join the same course twice
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE CASCADE
);
-- ===== 2. Sample data =====
INSERT INTO students (id, name, email) VALUES
  (1, 'Amina Wanjiru',  'amina@example.com'),
  (2, 'Brian Otieno',   'brian@example.com'),
  (3, 'Cynthia Mwangi', 'cynthia@example.com'),
  (4, 'David Kamau',    'david@example.com');

INSERT INTO courses (id, title, credits) VALUES
  (1, 'Web Foundations',   3),
  (2, 'Databases',         3),
  (3, 'JavaScript Basics', 4);

INSERT INTO enrolments (student_id, course_id, grade) VALUES
  (1, 1, 85),
  (1, 2, 90),
  (1, 3, 78),
  (2, 1, 72),
  (2, 3, NULL),
  (3, 1, 64);
  -- ===== 3. Queries =====

-- Q1: All courses for one student (by name)
SELECT courses.title, enrolments.grade
FROM students
JOIN enrolments ON enrolments.student_id = students.id
JOIN courses    ON courses.id = enrolments.course_id
WHERE students.name = 'Amina Wanjiru';
-- expected: Web Foundations 85, Databases 90, JavaScript Basics 78

-- Q2: All students on one course
SELECT students.name, students.email
FROM courses
JOIN enrolments ON enrolments.course_id = courses.id
JOIN students   ON students.id = enrolments.student_id
WHERE courses.title = 'Web Foundations';
-- expected: Amina, Brian, Cynthia

-- Q3: Number of students per course
SELECT courses.title, COUNT(enrolments.id) AS student_count
FROM courses
LEFT JOIN enrolments ON enrolments.course_id = courses.id
GROUP BY courses.id;
-- expected: Web Foundations 3, Databases 1, JavaScript Basics 2

-- Q4: Students who have no enrolments
SELECT students.name
FROM students
LEFT JOIN enrolments ON enrolments.student_id = students.id
WHERE enrolments.id IS NULL;
-- expected: David Kamau

-- Q5: Update one enrolment's grade (Brian, JavaScript Basics)
UPDATE enrolments
SET grade = 88
WHERE student_id = 2 AND course_id = 3;

-- Check the update worked
SELECT students.name, courses.title, enrolments.grade
FROM enrolments
JOIN students ON students.id = enrolments.student_id
JOIN courses  ON courses.id  = enrolments.course_id
WHERE students.id = 2 AND courses.id = 3;
-- expected: Brian Otieno, JavaScript Basics, 88

-- ===== 4. Index =====
-- Speeds up "who is on this course?" (Q2) and "students per course" (Q3)
CREATE INDEX idx_enrolments_course_id ON enrolments(course_id);