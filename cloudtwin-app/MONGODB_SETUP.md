# CloudTwin Authentication + MongoDB Setup Guide

## 🗄️ MongoDB Atlas Setup

### 1. Create MongoDB Atlas Account
- Go to https://www.mongodb.com/cloud/atlas
- Sign up or log in
- Create a new organization (or use existing)

### 2. Create a Cluster
- Click "Create" → Choose free tier (M0)
- Select your region (recommended: closest to users)
- Wait 5-10 minutes for cluster to initialize

### 3. Create Database User
- Go to **Database Access** in left sidebar
- Click "Add New Database User"
- Username: `cloudtwin-user` (or your choice)
- Password: Generate a strong one (copy it!)
- Built-in Role: `readWriteAnyDatabase`
- Click "Add User"

### 4. Configure Network Access
- Go to **Network Access** in left sidebar
- Click "Add IP Address"
- For development: Click "Allow Access from Anywhere" (0.0.0.0/0)
- For production: Add your server's IP only
- Click "Confirm"

### 5. Get Connection String
- Go to **Databases** → Click "Connect"
- Choose "Drivers"
- Copy the connection string (looks like):
  ```
  mongodb+srv://cloudtwin-user:<password>@cluster0.mongodb.net/cloudtwin?retryWrites=true&w=majority
  ```
- Replace `<password>` with the password you created in step 3

### 6. Create `.env.local` (in project root)
```bash
MONGODB_URI=mongodb+srv://cloudtwin-user:YOUR_PASSWORD@cluster0.mongodb.net/cloudtwin?retryWrites=true&w=majority
JWT_SECRET=your-random-secret-key-min-32-chars-recommended
PORT=5000
```

---

## 🚀 Installation & Running

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Both Frontend + Backend
```bash
npm run dev:all
```

OR run separately:
```bash
# Terminal 1 (Backend)
npm run server

# Terminal 2 (Frontend)
npm run dev
```

### 3. Test It Out
- Open http://localhost:5173
- Click "Create one now" to sign up
- Enter credentials and submit
- You should be redirected to CloudTwin dashboard

---

## 📊 MongoDB Collections

After signup/login, you'll see these in MongoDB Atlas:

**Collection: `users`**
```json
{
  "_id": ObjectId(...),
  "email": "user@example.com",
  "password": "hashed-bcrypt",
  "fullName": "John Doe",
  "company": "Acme Inc",
  "createdAt": ISODate(...),
  "updatedAt": ISODate(...)
}
```

---

## 🔐 Security Notes

⚠️ **PRODUCTION CHECKLIST**
- [ ] Change `JWT_SECRET` to a strong random string
- [ ] Use environment variables for all secrets
- [ ] Set CORS origin to your actual domain (not localhost)
- [ ] Enable HTTPS/TLS
- [ ] Restrict MongoDB IP whitelist to production server only
- [ ] Use HTTPS for cookie transmission (set `secure: true`)
- [ ] Add password reset functionality
- [ ] Add email verification
- [ ] Rate limit auth endpoints

---

## 🐛 Troubleshooting

**"MongoDB connection refused"**
- Check MongoDB URI in `.env.local`
- Verify IP whitelist includes your machine
- Confirm password is correct (no `@` escaping issues)

**"Signup works but login fails"**
- Check browser console for CORS errors
- Verify server is running on port 5000
- Clear browser cookies and try again

**"Cannot find module 'mongoose'"**
```bash
npm install mongoose bcryptjs jsonwebtoken cors cookie-parser express dotenv
```

---

Enjoy your neuomorphic auth system! 🚀⚡
