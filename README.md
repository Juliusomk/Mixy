# MIXY — Social Media Platform & Android Packaging Guide

MIXY is a full-stack social network featuring a real-time Feed, Stories, 24h Moments, vertical Reels, Direct Messages (themes, voice notes + transcription, polls, scheduled messages, calls), Creator Studio, Profiles, and **Julius AI**.

## Prerequisites

- Node.js 20+ and npm
- Firebase project (`savvy-form-hg33w` or your own) with Authentication and Cloud Firestore enabled
- `GEMINI_API_KEY` configured as a server-side environment secret (never exposed to the client)

## Environment Variables

Copy `.env.example` into `.env` (or configure secrets in your hosting environment):

- `GEMINI_API_KEY` — Server-side key for Julius AI (`gemini-4-hydrogen`), speech transcription (`gemini-3.5-transcribe`), and text-to-speech (`gemini-3.8-flash-lite-tts`).
- `APP_URL` — Public origin of the deployed web/API server.
- `ALLOWED_ORIGINS` — Optional comma-separated list of extra allowed CORS origins.
- `VITE_API_BASE_URL` — Leave empty for same-origin web hosting; set to your deployed HTTPS backend URL (e.g., `https://mixy-app.run.app`) when bundling for Android/Capacitor.

## Local Development & Verification

```bash
npm install
npm run dev
```

- Web/API server listens on `http://localhost:3000`.
- Type-check: `npm run lint`
- Production bundle: `npm run build` (outputs to `dist/`)
- Production zip archive: `npm run build:zip` (creates `mixy-production.zip`, excluding `node_modules`, `.env`, `.git`, `uploads`, and `data`)
- Security rules lint & tests:
  ```bash
  npx eslint firestore.rules
  node --experimental-strip-types --test firestore.rules.test.ts
  ```

## Firebase Rules Review

- `firestore.rules` — Enforces authenticated access, owner-only private PII isolation, server timestamp checks, and field whitelists.
- `storage.rules` — Enforces verified email authentication, 100 MB max upload size, and safe media MIME types if Firebase Cloud Storage is enabled.
- Always review and deploy rules via Firebase CLI or AI Studio before broad rollout.

## Android Packaging (Capacitor)

MIXY includes `capacitor.config.ts` (`appId: "com.mixy.social"`, `appName: "MIXY"`, `webDir: "dist"`).
To generate and build the native Android project on a machine with Android Studio / Android SDK installed:

1. Set `VITE_API_BASE_URL` to your deployed HTTPS backend URL before building:
   ```bash
   VITE_API_BASE_URL="https://your-deployed-mixy-backend.example.com" npm run build
   ```
2. Install Capacitor Android tooling in your native workspace and sync `dist/`:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap add android
   npx cap sync android
   ```
3. Configure Firebase for Android:
   - Register Android app `com.mixy.social` in Firebase Console.
   - Add your debug/release **SHA-1** and **SHA-256** fingerprints for Google Sign-In.
   - Place `google-services.json` inside `android/app/`.
4. Open in Android Studio to build `.apk` or `.aab`:
   ```bash
   npx cap open android
   ```
