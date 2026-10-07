// Global array to store loaded users in memory
let users = [];

// DOM Element references
const loadBtn = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusText = document.getElementById("status");
const usersList = document.getElementById("users-list");

/**
 * Draws any array of users to the DOM
 */
function renderUsers(list) {
  // Clear existing items
  usersList.innerHTML = "";

  if (list.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No users match your filter.";
    usersList.appendChild(li);
    return;
  }

  list.forEach((user) => {
    const li = document.createElement("li");

    // Safe property access in case any field is missing
    const name = user.name || "N/A";
    const email = user.email || "N/A";
    const city = user.address && user.address.city ? user.address.city : "N/A";
    const company =
      user.company && user.company.name ? user.company.name : "N/A";

    // Required details: name, email, city, and company name
    li.textContent = `${name} | ${email} | ${city} | ${company}`;
    usersList.appendChild(li);
  });
}

/**
 * Fetches users from JSONPlaceholder API
 */
async function loadUsers() {
  statusText.textContent = "Loading users...";
  loadBtn.disabled = true;
  usersList.innerHTML = "";
  filterInput.value = "";

  try {
    const response = await fetch("https://jsonplaceholder.typicode.com/users");

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    users = data; // Store in memory for filtering

    renderUsers(users);
    statusText.textContent = `Loaded ${users.length} users successfully.`;
  } catch (error) {
    statusText.textContent =
      "Could not load users. Please check your connection.";
    console.error("Fetch error details:", error);
  } finally {
    loadBtn.disabled = false;
  }
}

// Event Listeners
loadBtn.addEventListener("click", loadUsers);

filterInput.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase().trim();

  // Filter in memory without making a new network request
  const filtered = users.filter((user) =>
    user.name.toLowerCase().includes(query),
  );

  renderUsers(filtered);
});
