# EVRescue — Unified EV Charging Marketplace

A full-stack, production-grade electric vehicle charging marketplace connecting drivers with home hosts, shops, and commercial charging stations.

---

## 🏛️ System Architecture

```
EVRescue/
├── mobile/     # Single Unified Mobile App (React Native Expo)
│               #  ├── Driver Mode (Find, Reserve, Pay, Navigate)
│               #  ├── Provider Mode (Host Stations, Manage Slots, Review Drivers)
│               #  └── Shared Auth & Landing Page (Animations, OTP & Password)
│
├── backend/    # Node.js + Express + Prisma + Socket.IO + PostGIS
│               #  ├── Spatial 500m radius search
│               #  ├── Verification workflows & audit logging
│               #  └── Razorpay payments & real-time socket events
│
└── admin/      # Admin Web Dashboard (Vite + React + TypeScript)
                #  ├── Host verification queue (approve/reject/clarification)
                #  ├── Driver & user management
                #  ├── Real-time charging booking monitor
                #  └── Full system audit trail
```

---

## 🔑 Pre-Configured Test Accounts

| Role | Interface | Phone | Password | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | Web (`http://localhost:5173`) | `+919999999999` | `Admin@12345` | Full platform control & host verification |
| **Driver** | Mobile App | `+919800000001` | `Passw0rd!` | Pre-filled in Driver tab |
| **Provider** | Mobile App | `+919700000001` | `Passw0rd!` | Pre-filled in Provider tab (GreenVolt Hub) |

---

## 🚀 How to Run the Complete Platform

### Step 1: Ensure PostgreSQL Service is Running
1. Press `Win + R`, type `services.msc`, and press **Enter**.
2. Locate `postgresql-x64-18`.
3. Right-click and select **Start** (Status should be **Running**).

*(Optional: To re-seed fresh test data, run in `backend`):*
```powershell
npm run db:seed
```

---

### Step 2: Terminal 1 — Start the Backend Server
```powershell
cd "D:\EV App\backend"
npm run dev
```
- API starts at: `http://localhost:4000/api/v1`
- Swagger Docs: `http://localhost:4000/docs`

---

### Step 3: Terminal 2 — Start the Admin Web Dashboard
```powershell
cd "D:\EV App\admin"
npm run dev
```
- Open your browser at: `http://localhost:5173`
- Sign in using `+919999999999` and `Admin@12345`

---

### Step 4: Terminal 3 — Start the Unified Mobile Application
```powershell
cd "D:\EV App\mobile"
npx expo start
```
- **Phone testing**: Ensure your phone is connected to the same Wi-Fi network as your computer, then scan the QR code with Expo Go.
- **Web preview**: Press `w` in the terminal to view in your browser.
- **Android Emulator**: Press `a`.

