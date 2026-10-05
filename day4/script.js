// 1. Select all the required elements
const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

// 2. Function to update character and word counts + warning classes
function updateCounts() {
  const text = noteText.value;
  const numChars = text.length;

  // Calculate words (ignore extra spaces, handle empty box)
  const trimmed = text.trim();
  const numWords = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  // Update text displays
  charCount.textContent = `${numChars} / 200 characters`;
  wordCount.textContent = `${numWords} words`;

  // Manage .warning and .over classes on charCount
  charCount.classList.remove("warning", "over");
  if (numChars > 200) {
    charCount.classList.add("over");
  } else if (numChars > 180) {
    charCount.classList.add("warning");
  }
}

// 3. Function to clear everything
function clearNote() {
  noteText.value = "";
  localStorage.removeItem("noteDraft");
  updateCounts();
}

// 4. Listen for typing in the textarea
noteText.addEventListener("input", () => {
  updateCounts();
  localStorage.setItem("noteDraft", noteText.value);
});

// 5. Clear button click & Escape key listener
clearBtn.addEventListener("click", clearNote);

noteText.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    clearNote();
  }
});

// 6. Theme toggle button logic
themeToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark");

  const isDark = document.body.classList.contains("dark");
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
  localStorage.setItem("savedTheme", isDark ? "dark" : "light");
});

// 7. On page load: restore saved draft & theme, then update counts
const savedDraft = localStorage.getItem("noteDraft");
if (savedDraft) {
  noteText.value = savedDraft;
}

const savedTheme = localStorage.getItem("savedTheme");
if (savedTheme === "dark") {
  document.body.classList.add("dark");
  themeToggle.textContent = "Light mode";
}

// Initial call to set counters correctly on startup
updateCounts();
