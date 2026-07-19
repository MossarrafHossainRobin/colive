# NestHub

NestHub is a Next.js application for managing meals, bazar expenses, bills,
announcements, chat, and member notifications. It uses Firebase for
authentication, data, storage, and push messaging, plus Google Sheets for meal
synchronization.

## Requirements

- Node.js 20.9 or newer
- npm
- A Firebase project and web app
- Google OAuth and Google Sheets service-account credentials

## Install

Install the locked dependency versions:

```bash
npm ci
```

Create your local environment file and replace every placeholder:

```bash
cp .env.example .env.local
```

Never commit `.env.local` or service-account private keys. On a shared machine,
restrict the file with `chmod 600 .env.local`.

## Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production build

Public environment variables are embedded during the build, so configure them
before running:

```bash
npm run build
npm run start
```

Run `npm run lint` for a separate static check.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Authentication domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project used by the browser and FCM API |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Cloud Messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web app ID |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Firebase measurement ID |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Firebase Web Push certificate key |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth web client ID used by One Tap |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Single-line Firebase service-account JSON for sending FCM messages |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service-account email with access to the spreadsheet |
| `GOOGLE_PRIVATE_KEY` | Sheets service-account private key with newlines written as `\n` |
| `GOOGLE_SHEET_ID` | Target Google spreadsheet ID |

Start from `.env.example`; it contains placeholders only. Variables prefixed
with `NEXT_PUBLIC_` are shipped to the browser and must never contain secrets.

## External-service setup

### Firebase

1. Create a Firebase web app and copy its web configuration into the
   `NEXT_PUBLIC_FIREBASE_*` variables.
2. In Authentication, enable Email/Password and Google sign-in. Add localhost
   and every deployed hostname to the authorized domains.
3. Create Firestore and Storage, then configure security rules that permit the
   application operations appropriate for your users. This repository does not
   deploy Firebase rules.
4. In Cloud Messaging, create a Web Push certificate and use its public key as
   `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. Enable the FCM HTTP v1 API for the project.
5. Create a Firebase service account and place its complete JSON document in
   `FIREBASE_SERVICE_ACCOUNT_KEY` on one line.

The app passes the public Firebase web configuration to the messaging service
worker when it registers it, so the worker stays aligned with these variables.

### Google OAuth

Create a Web application OAuth client in Google Cloud, configure its authorized
JavaScript origins for localhost and deployed URLs, and set
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`. The same Google provider must be enabled in
Firebase Authentication.

### Google Sheets

1. Enable the Google Sheets API in the service account's Google Cloud project.
2. Put the service-account email and private key in
   `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`.
3. Share the target spreadsheet with that service-account email as an editor.
4. Set `GOOGLE_SHEET_ID` to the ID from the spreadsheet URL.
