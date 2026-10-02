// ===== Starting data =====
let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const CATEGORIES = ["personal", "work", "study"];

// ===== 1. searchNotes =====
function searchNotes(word) {
  const term = word.trim().toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(term));
}

// Normal case: case is ignored
console.log("searchNotes('MILK'):", searchNotes("MILK"));
// expected: [ { id: 1, text: "Buy milk and bread", category: "personal" } ]

// Normal case: more than one match
console.log("searchNotes('the'):", searchNotes("the"));
// expected: 2 notes (id 2 and id 3)

// Edge case: no results
console.log("searchNotes('xyz'):", searchNotes("xyz"));
// expected: []

// ===== 2. longestNote =====
function longestNote() {
  if (notes.length === 0) {
    return null; // empty array handled first
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note; // compare lengths
    }
  }
  return longest;
}

// Normal case
console.log("longestNote():", longestNote());
// expected: { id: 3, text: "Email the project report to Grace", category: "work" }

// Edge case: no notes at all
{
  const backup = notes; // keep the real array safe
  notes = []; // temporarily empty it
  console.log("longestNote() on empty array:", longestNote());
  // expected: null
  notes = backup; // put the real array back
}

// ===== 3. countByCategory =====
function countByCategory() {
  const counts = {};
  for (const note of notes) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  }
  return counts;
}

// Normal case
console.log("countByCategory():", countByCategory());
// expected: { personal: 2, study: 2, work: 1 }

// Edge case: no notes
{
  const backup = notes;
  notes = [];
  console.log("countByCategory() on empty array:", countByCategory());
  // expected: {}
  notes = backup;
}

// ===== 4. getSummary =====
function getSummary() {
  const counts = countByCategory();
  const parts = CATEGORIES.map(
    (category) => `${counts[category] || 0} ${category}`,
  );
  const label = notes.length === 1 ? "note" : "notes"; // "note" for exactly one
  return `${notes.length} ${label}: ${parts.join(", ")}.`;
}

// Normal case
console.log("getSummary():", getSummary());
// expected: "5 notes: 2 personal, 1 work, 2 study."

// Edge case: exactly one note, so the word must be "note"
{
  const backup = notes;
  notes = [notes[0]];
  console.log("getSummary() with one note:", getSummary());
  // expected: "1 note: 1 personal, 0 work, 0 study."
  notes = backup;
}

// ===== 5. isDuplicate =====
// Helper: trim, collapse repeated spaces into one, lowercase
function normalize(text) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function isDuplicate(text) {
  const clean = normalize(text);
  return notes.some((note) => normalize(note.text) === clean);
}

// Normal case: exact text exists
console.log("isDuplicate('Call mum'):", isDuplicate("Call mum"));
// expected: true

// Edge case: different case and extra spaces still count as a duplicate
console.log("isDuplicate('  call   MUM '):", isDuplicate("  call   MUM "));
// expected: true

// Normal case: new text
console.log("isDuplicate('Call dad'):", isDuplicate("Call dad"));
// expected: false

// ===== 6. addNote =====
function addNote(text, category) {
  const clean = String(text).trim().replace(/\s+/g, " ");

  if (clean.length < 1 || clean.length > 200) {
    console.log("Not added: text must be between 1 and 200 characters.");
    return false;
  }
  if (isDuplicate(clean)) {
    console.log("Not added: a note with this text already exists.");
    return false;
  }
  if (!CATEGORIES.includes(category)) {
    console.log("Not added: category must be personal, work or study.");
    return false;
  }

  const nextId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  notes.push({ id: nextId, text: clean, category: category });
  return true;
}

// ===== addNote tests (keep these last) =====

// Normal case: valid note
console.log("add valid note:", addNote("Read chapter 4", "study"));
// expected: true

// Edge case: duplicate, with different case and spaces
console.log("add duplicate:", addNote("  buy   MILK and bread ", "personal"));
// expected: logs the duplicate reason, then false

// Edge case: empty text
console.log("add empty text:", addNote("   ", "work"));
// expected: logs the length reason, then false

// Edge case: 201 characters
console.log("add 201 chars:", addNote("x".repeat(201), "work"));
// expected: logs the length reason, then false

// Edge case: invalid category
console.log("add bad category:", addNote("Plan trip", "hobby"));
// expected: logs the category reason, then false

// Final state
console.log("notes after adding:", notes);
// expected: 6 notes, the new one is { id: 6, text: "Read chapter 4", category: "study" }

console.log("getSummary():", getSummary());
// expected: "6 notes: 2 personal, 1 work, 3 study."
