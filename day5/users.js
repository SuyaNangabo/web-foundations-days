// The API endpoint to fetch 10 users
const API_URL = "https://jsonplaceholder.typicode.com/users";

// 1. Grab HTML elements from index.html
const loadBtn = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusText = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

// 2. We store users here so we can filter them WITHOUT making new network requests
let allUsers = [];

/**
 * Helper function: Takes an array of users and adds them to the page
 */
function renderUsers(usersToDisplay) {
  // Clear any existing list items first
  usersList.innerHTML = "";

  // If no users match, show the required message
  if (usersToDisplay.length === 0) {
    const emptyLi = document.createElement("li");
    emptyLi.textContent = "No users match your filter.";
    usersList.appendChild(emptyLi);
    return;
  }

  // Loop through each user and display their name, email, city, and company
  usersToDisplay.forEach((user) => {
    const li = document.createElement("li");

    const name = user.name;
    const email = user.email;
    const city = user.address.city;
    const company = user.company.name;

    // Use textContent to safely insert the text
    li.textContent = `${name} | Email: ${email} | City: ${city} | Company: ${company}`;

    usersList.appendChild(li);
  });
}

/**
 * Main fetch function: Loads users from the server
 */
async function loadUsers() {
  // Show loading state and disable button so user can't click multiple times
  statusText.textContent = "Loading users...";
  loadBtn.disabled = true;
  usersList.innerHTML = "";
  filterInput.value = ""; // Clear the filter box

  try {
    const response = await fetch(API_URL);

    // Always check response.ok! (Fetch doesn't throw errors for 404/500 automatically)
    if (!response.ok) {
      throw new Error(`Server returned status: ${response.status}`);
    }

    // Parse data and save it to our variable
    allUsers = await response.json();

    // Render users and show success message
    renderUsers(allUsers);
    statusText.textContent = `Loaded ${allUsers.length} users successfully.`;
  } catch (error) {
    // Show user-friendly error message
    statusText.textContent =
      "Could not load users. Please check your connection.";
    console.error(error);
  } finally {
    // finally runs whether the fetch succeeded or failed
    loadBtn.disabled = false;
  }
}

// 3. Listen for clicks on the "Load Users" button
loadBtn.addEventListener("click", loadUsers);

// 4. Listen for typing in the filter box (Case-Insensitive)
filterInput.addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase().trim();

  // Filter the allUsers array we saved earlier
  const matchedUsers = allUsers.filter((user) =>
    user.name.toLowerCase().includes(query),
  );

  renderUsers(matchedUsers);
});
