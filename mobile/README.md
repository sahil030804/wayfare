# Wayfare for Android

Expo SDK 58 Android app for the existing Wayfare Supabase project. Package ID: `com.wayfare.trips`. It shares accounts, trips, expenses, and confirmed settlements with the web app.

## Run locally

1. Copy `.env.example` to `.env.local`. Set the Supabase public URL and publishable/anon key from the existing web project. Set `EXPO_PUBLIC_SITE_URL` to the public HTTPS origin where the web app's `/privacy` and `/delete-account` pages are deployed. Never put a service role key in this app.
2. Apply `supabase/migrations/20261124_account_deletion_requests.sql` in the Supabase SQL Editor so deletion requests work from Android and web.
3. Run `npm ci`, then `npx expo start` to use Expo Go, or `npx expo run:android` with an Android device/emulator and the required Android SDK.
4. Run `npm run typecheck`, `npx expo-doctor`, and `npm run export:android` before building.

## Release

See [PLAY_STORE_RELEASE.md](./PLAY_STORE_RELEASE.md). `eas.json` has an installable preview APK profile and a production Android App Bundle profile. A production build requires an Expo account, build credentials, and public environment variables configured in EAS. The public URL and privacy/deletion pages must be live before distribution.

## Payment behavior

The UPI button opens an external payment app. Wayfare does not take payment. The sender marks a payment sent, then the recipient confirms or rejects it. Only confirmed payments change balances.
