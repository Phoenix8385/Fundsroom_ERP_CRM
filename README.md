# FundsRoom — Mini ERP + CRM Operations Portal

A role-based ERP/CRM system for a wholesale/distribution business — customers, inventory, and sales challans, built for internal Sales, Warehouse, and Accounts teams.


## 🔑 Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@fundsroom.test` | `Admin@123` |
| Sales | `sales@fundsroom.test` | `Sales@123` |
| Warehouse | `warehouse@fundsroom.test` | `Ware@123` |
| Accounts | `accounts@fundsroom.test` | `Acc@123` |


## 🧰 Tech Stack

- **Backend:** Node.js, TypeScript, Express, PostgreSQL, Prisma ORM
- **Auth:** JWT (8-hour expiry), bcrypt password hashing
- **Validation:** Zod
- **Frontend:** React (TypeScript), React Router, Axios, Framer Motion
- **Deployment:** Vercel (frontend) · Render (backend) · Neon (PostgreSQL)


## 🏗️ How the Server Was Set Up

- Backend initialized as a standalone Express + TypeScript project (`backend/`), independent from the frontend (`frontend/`)
- Database schema defined in Prisma (`backend/prisma/schema.prisma`), version-controlled as the single source of truth for all tables
- Migrations run via `prisma migrate dev`, generating a typed Prisma Client used across all routes — no raw SQL
- Central error-handling middleware returns consistent `{ error: string }` JSON with correct HTTP status codes across every endpoint
- Role-based access enforced via reusable middleware (`authenticate` + `requireRole`) applied per-route, not per-page (so the API is secure even if someone bypasses the UI)


## 🔐 Environment Variables

Environment variables are documented in `.env.example` and never committed as real values (`.env` is git-ignored).

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (Neon) |
| `JWT_SECRET` | Signing secret for auth tokens |
| `PORT` | Backend server port (default `4000`) |
| `NODE_ENV` | `development` / `production` |
| `CORS_ORIGIN` | Allowed frontend origin(s) |

**Setup:**
```bash
cp .env.example .env
# then fill in real values
```


## 💻 Running Locally

**Backend:**
```bash
cd backend
npm install
cp .env.example .env        # fill in DATABASE_URL and JWT_SECRET
npx prisma migrate dev --name init
npx prisma generate
npx ts-node prisma/seed.ts  # creates the 4 test accounts above
npm run dev                 # runs on http://localhost:4000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev                 # runs on http://localhost:5173
```


## 🚀 Deployment

| Layer | Platform | Notes |
|-------|----------|-------|
| Database | Neon (PostgreSQL) | Pooled connection string set as `DATABASE_URL` |
| Backend | Render | Env vars set in dashboard, not committed |
| Frontend | Vercel | `VITE_API_URL` points to the deployed backend |

- **Live Frontend:** `[TODO — add after Phase 10]`
- **Live Backend:** `[TODO — add after Phase 10]`



## 🏛️ Architecture

- **Layered structure:** routes → middleware (auth/role checks) → Prisma Client → PostgreSQL. No business logic lives in route files beyond orchestration — kept close to the data layer for testability.
- **Snapshot pattern on Sales Challans:** each `ChallanItem` stores its own copy of product name, SKU, and price at the time of sale, instead of only a foreign key. This means historical challans stay accurate even if a product's price changes later.
- **Atomic stock operations:** confirming or cancelling a challan runs inside a Prisma `$transaction`, re-checking live stock at confirm time — preventing two near-simultaneous confirms from both passing a stale stock check and pushing inventory negative.
- **Role enforcement at the API layer**, not just hidden in the UI — `requireRole()` middleware guards every write route, so permissions hold even if someone calls the API directly.


## ⚠️ Assumptions Made

- Chose **PostgreSQL** per the brief's requirement, over MongoDB (despite the MERN stack background), to comply with the stated tech stack exactly
- Simple JWT auth (no refresh tokens / OAuth) — acceptable per the brief's "Simple JWT-based authentication is acceptable" note
- Stock movement rows are created automatically by the system (challan confirm/cancel, or a manual Warehouse stock adjustment) — never edited directly, to preserve an accurate audit trail
- Challan numbers are generated sequentially in-app (e.g. `CH-2026-0001`), not user-entered


## 🚧 Known Limitations / Incomplete Parts

*(Update this section honestly as you finish each phase — a specific, accurate list here reads as maturity, not weakness.)*

- `[ ]` Bonus features not implemented: Docker setup, GitHub Actions CI, PDF invoice export, S3 product image upload
- `[ ]` `[Add anything you scope-cut as you go]`


## 📼 Submission Assets

- **GitHub Repo:** this repository
- **Postman Collection:** `[link or file name]`
- **Screen Recording:** `[raw build sessions + narrated walkthrough link]`
