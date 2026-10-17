# CloudOps Portal — Backend API (ITELECT4 GT4)

RESTful API backend for the CloudOps Provisioning and Workspace Management Portal.

## 🔗 Live Deployments & Repositories

- **Live Backend API:** [https://itelect4-backend-sand.vercel.app](https://itelect4-backend-sand.vercel.app)
- **Live Frontend App:** [https://itelect4-project-paulot.vercel.app](https://itelect4-project-paulot.vercel.app)
- **Frontend GitHub Repo:** [https://github.com/papap7/itelect4-project-paulot](https://github.com/papap7/itelect4-project-paulot)
- **Backend GitHub Repo:** [https://github.com/papap7/itelect4-backend](https://github.com/papap7/itelect4-backend)

---

## 🛠️ Tech Stack

- **Runtime:** Node.js / Express
- **Language:** TypeScript (Strict mode)
- **Database:** MongoDB Atlas via Mongoose (Serverless connection promise-caching)
- **Authentication:** JWT (JSON Web Tokens) & bcryptjs password hashing
- **Deployment:** Vercel Serverless Functions

---

## 📡 API Endpoints

### Public Routes
- `GET /api/health` — Service health & MongoDB connection status (`{"ok": true, "db": true}`)
- `GET /api/workspaces` — List of all 6 reference workspaces (sorted by `workspaceId`)
- `GET /api/workspaces/:workspaceId` — Fetch a single workspace by numeric ID
- `POST /api/auth/register` — Create new engineer account (`{ name, email, password }`)
- `POST /api/auth/login` — Authenticate and receive JWT token (`{ email, password }`)

### Protected Routes (Requires `Authorization: Bearer <token>`)
- `GET /api/provision-requests` — Fetch provision requests owned by the authenticated engineer
- `POST /api/provision-requests` — Create a new provision request (`{ workspaceId, resourceType }`)
- `GET /api/provision-requests/:id` — Fetch request details
- `PATCH /api/provision-requests/:id` — Update request
- `DELETE /api/provision-requests/:id` — Delete request

---

## 💻 Local Development

1. **Clone repository:**
   ```bash
   git clone https://github.com/papap7/itelect4-backend.git
   cd itelect4-backend
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Environment Setup:**
   Create a `.env` file based on `.env.example`:
   ```env
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   PORT=4000
   CORS_ORIGIN=http://localhost:5173
   ```
4. **Seed Database:**
   ```bash
   npm run seed
   ```
5. **Start Dev Server:**
   ```bash
   npm run dev
   ```
