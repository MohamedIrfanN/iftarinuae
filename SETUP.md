# Local Development Setup Guide 🛠️

This guide walks you through everything you need to run IftarInUAE locally for the first time — from setting up the database to connecting Firebase.


---

## Prerequisites

Install these before starting:

| Tool | Required Version | Download |
|------|-----------------|----------|
| Node.js | v20+ | [nodejs.org](https://nodejs.org/) |
| Git | Any recent | [git-scm.com](https://git-scm.com/) |
| A code editor | — | [VS Code](https://code.visualstudio.com/) recommended |

You will also need free accounts on:
- [Neon](https://neon.tech) — serverless PostgreSQL (free tier works)
- [Firebase](https://firebase.google.com) — authentication

---

## Step 1 — Clone & Install

```bash
git clone https://github.com/adilzubair/iftarinuae.git
cd iftarinuae
npm install
```

---

## Step 2 — Set Up the Database (Neon)

1. Sign in to [neon.tech](https://neon.tech) and click **New Project**.
2. Give it a name (e.g. `iftarinuae-dev`) and choose a region close to you.
3. Once created, go to the **Dashboard** and click **Connect**.
4. Select the **Pooled connection** tab and copy the connection string. It looks like:
   ```
   postgresql://neondb_owner:PASSWORD@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```
5. Paste it as `DATABASE_URL` in your `.env` file (see Step 4).

> **Tip:** Use the **pooled** connection string (not the direct one) — it handles connection limits better in serverless/dev environments.

---

## Step 3 — Set Up Firebase

### Part A — Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com) and click **Add project**.
2. Name it (e.g. `iftarinuae-dev`), disable Google Analytics if you don't need it, and click **Create**.

### Part B — Register a Web App (Frontend Config)

1. On your project's **Project Overview** page, click the **`</>`** (Web) icon.
2. Register the app with a nickname (e.g. `iftarinuae-web`). You don't need Firebase Hosting.
3. Copy the `firebaseConfig` object. Map the values to your `.env` like this:

   | `firebaseConfig` key | `.env` variable |
   |----------------------|-----------------|
   | `apiKey` | `VITE_FIREBASE_API_KEY` |
   | `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
   | `projectId` | `VITE_FIREBASE_PROJECT_ID` |
   | `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
   | `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
   | `appId` | `VITE_FIREBASE_APP_ID` |

### Part C — Enable Google Sign-In

1. In the sidebar, go to **Build → Authentication** and click **Get started**.
2. Under the **Sign-in method** tab, click **Google** and toggle it **Enabled**.
3. Enter a support email and click **Save**.
4. Go to the **Settings** tab → **Authorized domains** and confirm `localhost` is listed (it is by default). Add any other domains you need.

### Part D — Generate the Admin SDK Key (Backend)

1. Click the **gear icon** (⚙️) → **Project Settings**.
2. Go to the **Service Accounts** tab.
3. Make sure **Firebase Admin SDK** is selected and click **Generate new private key**.
4. A JSON file will be downloaded. Open it and extract:

   | JSON field | `.env` variable |
   |------------|-----------------|
   | `project_id` | `FIREBASE_PROJECT_ID` |
   | `client_email` | `FIREBASE_CLIENT_EMAIL` |
   | `private_key` | `FIREBASE_PRIVATE_KEY` |

   > ⚠️ **Private key formatting is critical.** The value must be a single-line string with literal `\n` characters (not real newlines). Copy it exactly as it appears in the JSON file — including the `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n` wrapper.
   >
   > **Correct** in `.env`:
   > ```
   > FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
   > ```
   > **Incorrect** (real line breaks will cause an auth error):
   > ```
   > FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
   > MIIEv...
   > -----END PRIVATE KEY-----
   > "
   > ```

---

## Step 4 — Configure Environment Variables

Copy the example file:

```bash
cp .env.example .env
```

Then open `.env` and fill in all values from Steps 2 and 3. Your completed file should look like:

```env
# Database
DATABASE_URL="postgresql://neondb_owner:PASSWORD@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Server Configuration
PORT=5001

# Firebase Client (Frontend)
VITE_FIREBASE_API_KEY="AIza..."
VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="your-project"
VITE_FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
VITE_FIREBASE_MESSAGING_SENDER_ID="123456789"
VITE_FIREBASE_APP_ID="1:123456789:web:abc123"

# Firebase Admin (Backend)
FIREBASE_PROJECT_ID="your-project"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```

> **Never commit `.env`** — it is already in `.gitignore`.

---

## Step 5 — Push the Database Schema

This creates all the tables in your Neon database:

```bash
npm run db:push
```

You should see output confirming the tables were created. If you get a connection error, double-check your `DATABASE_URL`.

---

## Step 6 — Start the Dev Server

```bash
npm run dev
```

The app runs at **[http://localhost:5001](http://localhost:5001)**.

Both the API (`/api/*`) and the React frontend are served from the same port in development — no separate frontend server needed.

---

## Verifying Everything Works

| Check | How |
|-------|-----|
| App loads | Visit `http://localhost:5001` |
| Google Sign-In works | Click **Sign In** and complete the Google OAuth flow |
| Database connected | Submit a new Iftar spot — it should persist on refresh |
| API responding | Visit `http://localhost:5001/api/spots` — should return JSON |

---

## Troubleshooting

### `FIREBASE_PRIVATE_KEY` error on startup
> `Error: error:09091064:PEM routines` or `invalid_grant`

The private key has incorrect formatting. Ensure:
- The value is wrapped in **double quotes** in `.env`
- Newlines are `\n` (two characters: backslash + n), not actual line breaks

### Database connection refused
- Confirm `DATABASE_URL` is the **pooled** connection string from Neon
- Check your Neon project isn't paused (free tier auto-pauses after inactivity — just open the Neon dashboard to wake it)

### Google Sign-In popup closes immediately / `auth/unauthorized-domain`
- Go to Firebase Console → Authentication → Settings → **Authorized domains**
- Add `localhost` if it's missing

### Port already in use
Change the port in `.env`:
```env
PORT=5002
```

---

## Next Steps

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the branching and commit workflow before making changes.

