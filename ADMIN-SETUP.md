# Admin Setup Guide

## Creating Admin User

Run the script inside the running container. There is no default password:
`ADMIN_PASSWORD` (12+ characters) is required, and `ADMIN_EMAIL` defaults to
`admin@example.com`. `exec` does not forward your shell's variables, so pass
them with `-e`:

```bash
export ADMIN_PASSWORD="$(openssl rand -base64 24)"
docker exec -e ADMIN_PASSWORD -e ADMIN_EMAIL=your@email.com -e ADMIN_NAME="Your Name" \
  inite-auth-service npm run create-admin
```

Change the password after the first sign-in.

---

## Admin API Endpoints

All endpoints require JWT authentication with `admin` role.

### Dashboard Stats
```bash
GET /v1/admin/stats
```

### Users Management
```bash
# List all users
GET /v1/admin/users?page=1&limit=50

# Get user details
GET /v1/admin/users/:userId

# Update user roles
PUT /v1/admin/users/:userId/roles
Body: { "roles": ["user", "admin"] }

# Delete user
DELETE /v1/admin/users/:userId
```

### OAuth Clients Management
```bash
# List all OAuth clients
GET /v1/admin/oauth-clients

# Get client details
GET /v1/admin/oauth-clients/:clientId

# Create new client — the secret is generated server-side and returned once
POST /v1/admin/oauth-clients
Body: {
  "name": "My App",
  "clientId": "my-app",
  "redirectUris": ["https://myapp.com/callback"],
  "allowedScopes": ["openid", "profile", "email"]
}

# Update client
PUT /v1/admin/oauth-clients/:clientId
Body: {
  "name": "Updated Name",
  "redirectUris": ["https://newurl.com/callback"],
  "active": true
}

# Delete client
DELETE /v1/admin/oauth-clients/:clientId
```

---

## Example: Create Admin with curl

```bash
# Login as admin
curl -X POST https://auth.inite.ai/v1/auth/password/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your@email.com",
    "password": "<ADMIN_PASSWORD>"
  }'

# Save the access_token from response

# Get stats
curl https://auth.inite.ai/v1/admin/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Security Notes

1. **Change the bootstrap password** after the first sign-in
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





