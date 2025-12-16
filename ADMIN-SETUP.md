# Admin Setup Guide

## Creating Admin User

### 1. After deployment, exec into the container:

```bash
docker exec -it inite-auth-service bash
```

### 2. Run the admin creation script:

```bash
npm run create-admin
```

Default credentials:
- **Email**: `admin@inite.ai`
- **Password**: `admin123`

### 3. Custom admin credentials (optional):

```bash
ADMIN_EMAIL=your@email.com \
ADMIN_PASSWORD=your_secure_password \
ADMIN_NAME="Your Name" \
npm run create-admin
```

### 4. Change password after first login!

---

## Admin API Endpoints

All endpoints require JWT authentication with `admin` role.

### Dashboard Stats
```bash
GET /admin/stats
```

### Users Management
```bash
# List all users
GET /admin/users?page=1&limit=50

# Get user details
GET /admin/users/:userId

# Update user roles
PUT /admin/users/:userId/roles
Body: { "roles": ["user", "admin"] }

# Delete user
DELETE /admin/users/:userId
```

### OAuth Clients Management
```bash
# List all OAuth clients
GET /admin/oauth-clients

# Get client details
GET /admin/oauth-clients/:clientId

# Create new client
POST /admin/oauth-clients
Body: {
  "name": "My App",
  "clientId": "my-app",
  "clientSecret": "generated-secret",
  "redirectUris": ["https://myapp.com/callback"],
  "allowedScopes": ["openid", "profile", "email"]
}

# Update client
PUT /admin/oauth-clients/:clientId
Body: {
  "name": "Updated Name",
  "redirectUris": ["https://newurl.com/callback"],
  "isActive": true
}

# Delete client
DELETE /admin/oauth-clients/:clientId
```

---

## Example: Create Admin with curl

```bash
# Login as admin
curl -X POST https://auth.inite.ai/auth/password/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@inite.ai",
    "password": "admin123"
  }'

# Save the access_token from response

# Get stats
curl https://auth.inite.ai/admin/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Security Notes

1. **Change default password immediately** after first deployment
2. Admin role is stored in `user.metadata.roles` array
3. Admin flag is also set in `user.metadata.isAdmin`
4. All admin endpoints use `AdminGuard` which checks for admin role
5. OAuth client secrets are **never exposed** in API responses

---

## Frontend Admin Panel (Coming Soon)

A full admin dashboard will be available at:
- **URL**: `https://auth.inite.ai/admin`
- **Features**:
  - User management
  - OAuth client management
  - Analytics dashboard
  - Audit logs

For now, use the API endpoints directly or build your own admin UI.

