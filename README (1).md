# FundsRoom — Mini ERP + CRM Operations Portal

A role-based ERP/CRM system for a wholesale/distribution business — customers, inventory, and sales challans, built for internal Sales, Warehouse, and Accounts teams.

---

## 🔑 Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@fundsroom.test` | `Admin@123` |
| Sales | `sales@fundsroom.test` | `Sales@123` |
| Warehouse | `warehouse@fundsroom.test` | `Ware@123` |
| Accounts | `accounts@fundsroom.test` | `Acc@123` |

---

## 🧰 Tech Stack

- **Backend:** Node.js, TypeScript, Express, PostgreSQL, Prisma ORM
- **Auth:** JWT (8-hour expiry), bcrypt password hashing
- **Validation:** Zod
- **Frontend:** React (TypeScript), React Router, Axios, Framer Motion
- **Deployment:** Vercel (frontend) · Render (backend) · Neon (PostgreSQL)

---

## 🏗️ How the Server Was Set Up

- Backend initialized as a standalone Express + TypeScript project (`backend/`), independent from the frontend (`frontend/`)
- Database schema defined in Prisma (`backend/prisma/schema.prisma`) — the single source of truth for all tables, with indexes on every field the API filters/searches by
- Migrations run via `prisma migrate dev` locally and `prisma migrate deploy` in production, generating a typed Prisma Client used across all routes — no raw SQL
- Central error-handling middleware returns consistent `{ error: string }` JSON with correct HTTP status codes, including mapped Prisma errors (e.g. duplicate SKU → 409, not a raw 500)
- Role-based access enforced via reusable middleware (`authenticate` + `requireRole`) applied per-route at the API layer, not per-page — so permissions hold even if a request bypasses the UI entirely
- Read endpoints (viewing customers, products, challans) are open to every authenticated role; write endpoints are restricted per a role matrix (Admin/Sales for customers & challans, Admin/Warehouse for products) — Accounts is read-only everywhere by design

---

## 🔐 Environment Variables

Documented in `backend/.env.example`; never committed as real values (`.env` is git-ignored).

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (Neon, pooled) |
| `JWT_SECRET` | Signing secret for auth tokens |
| `PORT` | Backend server port (default `4000`) |
| `NODE_ENV` | `development` / `production` |
| `CORS_ORIGIN` | Allowed frontend origin (the deployed Vercel URL) |
| `VITE_API_URL` *(frontend)* | Backend API base URL the React app calls |

**Setup:**
```bash
cp .env.example .env
# then fill in real values
```

---

## 💻 Running Locally

**Backend:**
```bash
cd backend
npm install
cp .env.example .env        # fill in DATABASE_URL and JWT_SECRET
npx prisma migrate dev --name init
npx prisma generate
npx ts-node prisma/seed.ts  # creates the 4 test accounts above
npm run dev                 # http://localhost:4000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

---

## 🚀 Deployment

| Layer | Platform | Notes |
|-------|----------|-------|
| Database | Neon (PostgreSQL) | Pooled connection string set as `DATABASE_URL` |
| Backend | Render | Build: `npm install && npx prisma generate && npx prisma migrate deploy && npm run build` · Start: `npm run start` |
| Frontend | Vercel | Root Directory set to `frontend`; `VITE_API_URL` points to the Render backend |

- **Live Backend:** https://fundsroom-erp-backend-lb5s.onrender.com
- **Live Frontend:** `[ADD YOUR VERCEL URL HERE]`
- **Health check:** https://fundsroom-erp-backend-lb5s.onrender.com/health

> Note: the backend runs on Render's free tier, which spins down after inactivity. The first request after idle time can take 30–50 seconds to respond while it wakes up — expected, not a bug.

---

## 🏛️ Architecture

The backend follows a layered structure: routes → role-guard middleware → Prisma Client → PostgreSQL, with no business logic living outside the route/service layer. All four resource routers (auth, customers, products, challans) share the same `asyncHandler` and `AppError` utilities, so every endpoint fails in a consistent, typed way instead of ad-hoc `try/catch` blocks scattered through the codebase.

The Sales Challan module is the core of the system's business logic. Each `ChallanItem` stores a snapshot of its product's name, SKU, and price at the moment the challan is created, rather than a live foreign-key join — so historical challans stay accurate even if a product's price changes later. Confirming or cancelling a challan runs entirely inside a Prisma `$transaction`, re-reading both the challan's status and every line item's live stock *inside* that transaction before making any change. This closes a real race condition: without it, two near-simultaneous confirm requests on the same product could both pass a stale stock check and both deduct, pushing inventory negative.

Role enforcement happens at the API layer, not just hidden in the UI — `requireRole()` middleware guards every write route server-side, so permissions hold even against a direct API call. Read access (viewing customers, products, and challans) is intentionally open to every authenticated role, since Warehouse and Accounts staff realistically need to look things up without editing them, and Sales specifically needs live product/stock visibility to build a challan.

---

## ⚠️ Assumptions Made

- Chose **PostgreSQL** per the brief's explicit requirement, over MongoDB — despite building the frontend/backend with recently-learned MERN-stack skills, the database layer uses Prisma + Postgres to match the stated tech stack exactly
- Simple JWT auth (no refresh tokens / OAuth) — acceptable per the brief's note that "simple JWT-based authentication is acceptable"
- Stock movement rows are created only by the system (challan confirm/cancel, or a manual Warehouse stock adjustment) — never edited directly, to preserve an accurate audit trail
- Challan numbers are generated sequentially in-app (e.g. `CH-2026-0001`), with a retry-on-collision safeguard for near-simultaneous creates, rather than being user-entered
- Read access to customers/products/challans is open to all authenticated roles (not just Admin/creator roles), since the brief describes internal teams working off one shared operational view

---

## 🚧 Known Limitations / Incomplete Parts

- Bonus features not implemented: Docker setup, GitHub Actions CI, PDF invoice export, S3 product image upload
- Backend is hosted on Render's free tier — cold starts after inactivity add latency to the first request (see Deployment note above)
- `[Update this line honestly based on your final live testing pass — e.g. any edge case not covered, UI polish skipped, or Phase 8's animated login hero if you ended up cutting it for time]`

---

## 📼 Submission Assets

- **GitHub Repo:** this repository
- **Postman Collection:** `FundsRoom.postman_collection.json` (included in repo root)
- **Screen Recording:** `[add your recording link(s) here]`
