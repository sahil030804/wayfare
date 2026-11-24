# Wayfare

A phone-first trip expense splitter for groups in India. Organizers add friends by their existing Wayfare account email; every member sees the same trip, records equal-split expenses, and confirms UPI payments after the trip ends.

## Run locally

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor.
2. Copy `.env.example` to `.env.local`. Fill in the project URL and publishable (anon) key. Set `NEXT_PUBLIC_SITE_URL` to the full origin you use for the app, including `https://` in production.
3. In Supabase Authentication → Emails → Templates, update **both** templates: **Magic Link** uses [`magic-link-otp.subject.txt`](supabase/templates/magic-link-otp.subject.txt) and [`magic-link-otp.html`](supabase/templates/magic-link-otp.html); **Confirm signup** uses [`confirm-signup-otp.subject.txt`](supabase/templates/confirm-signup-otp.subject.txt) and [`confirm-signup-otp.html`](supabase/templates/confirm-signup-otp.html). Replace each subject and entire body in the hosted dashboard, then save and reopen to verify. Returning users receive Magic Link / OTP; first-time users with email confirmation enabled receive Confirm signup. Both bodies use `{{ .Token }}` and omit `{{ .ConfirmationURL }}`. The app accepts the configurable 6–10 digit email OTP length. Configure SMTP for real users. Keep the app origin in Supabase's URL configuration for any existing links.
4. Run `npm install` and `npm run dev`. Open `http://localhost:3000`.

Supabase's built-in email sender currently allows only two authentication emails per hour across the project. For a multi-user trip app, configure a custom SMTP provider in Supabase Authentication → Emails → SMTP Settings, then review Authentication → Rate Limits. OTP uses the same email sender and rate limits as magic links. The app displays a clear message when this limit is reached and disables the send button while a request is pending. Existing links already delivered can still be opened while sending is limited.

To add optional, clearly marked sample trips for `sahilranpariya60@gmail.com`, run [`supabase/seed-sahil.sql`](supabase/seed-sahil.sql) in the same project's SQL Editor. It is safe to rerun; it only adds missing sample rows. The sample friends are fictional and have not joined with accounts, so their expenses illustrate the ledger but they cannot confirm payments.

If the project was set up before expense locations were added, run [`supabase/migrations/20261124_expense_location.sql`](supabase/migrations/20261124_expense_location.sql) once in the SQL Editor. New projects only need `schema.sql`. An expense's date is its recorded creation time, displayed in India time. Location is optional and captured once when requested; it is rounded to four decimal places and visible to trip members through a map link. Browser geolocation needs HTTPS in production.

For projects created before the security and reliability fixes, run [`supabase/migrations/20261124_review_fixes.sql`](supabase/migrations/20261124_review_fixes.sql) in the SQL Editor. It includes any missing expense-location columns, restricts profile reads, adds invite renewal and trip UPI lookup, and makes expense and location saves atomic.

For existing projects, also run [`supabase/migrations/20261124_existing_account_friends.sql`](supabase/migrations/20261124_existing_account_friends.sql). New projects only need `schema.sql`. Add friends using the email on their registered, verified account after they complete their profile. The organizer can connect older name-only placeholders to existing accounts; their recorded expenses and balances stay with that member. Existing personal invite links still work until used or replaced, but new friends are connected by email and appear in their trip list immediately. The app does not send a separate invitation email.

## V1 rules

- Only friends connected to platform accounts can share a new expense. An expense may be for one friend; the payer does not have to be a participant.
- Expenses can be edited before the organizer ends the trip. Ending locks the ledger.
- A UPI handoff opens a payment app when supported. The app does not handle money or independently verify payment. The recipient confirms or rejects a reported transfer.
- INR only; equal splits only; full transfer reporting only. Receipts, refunds, partial payments, and reopening a closed trip are deferred.

## Checks

`npm run build` compiles the app. `npm test` checks the money calculations. Database access rules require a configured Supabase project for integration testing.

## Android app

The native Android client is in [`mobile/`](mobile/). See its [setup guide](mobile/README.md) and [Play Store release sheet](mobile/PLAY_STORE_RELEASE.md). It uses the same Supabase project as this web app.
