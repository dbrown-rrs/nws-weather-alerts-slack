// Admin user configuration
const ADMIN_USERS = [
  'U0933N0P0LB', // Your user ID
  // Add more admin user IDs here as needed
];

function isAdmin(userId) {
  return ADMIN_USERS.includes(userId);
}

function getAdminUsers() {
  return [...ADMIN_USERS];
}

module.exports = {
  isAdmin,
  getAdminUsers,
  ADMIN_USERS
};