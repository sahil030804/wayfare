# Wayfare Android release sheet

## Store listing draft

- App name: Wayfare: Trip Expense Splitter
- Short description: Split trip costs with friends and settle every share clearly.
- Category: Finance (verify in Play Console before submission)
- Support email: automationbysahil@gmail.com
- Privacy URL: `https://<deployed-domain>/privacy`
- Account deletion URL: `https://<deployed-domain>/delete-account`

**Full description**

Wayfare keeps the money side of group travel simple. Create a trip, add friends by their Wayfare account email, and record expenses from anyone in the group. Choose exactly which friends shared each cost, including a purchase made for just one person. Everyone can see dated expenses, their share, and the trip balance in one place.

When the trip ends, Wayfare shows who should pay whom. Open a UPI app using a friend's optional UPI ID, mark the payment sent, and let the recipient confirm it. You can optionally attach a one-time location snapshot to an expense. Wayfare does not track your location continuously or process payments itself.

## Release tasks still required

1. Deploy the existing Next.js website to a public HTTPS domain. Verify `/privacy` and `/delete-account` load without sign-in, and the deletion request flow works after sign-in. Set `EXPO_PUBLIC_SITE_URL` to that origin for every EAS environment.
2. Apply `supabase/migrations/20261124_account_deletion_requests.sql` to the production project. Monitor `public.account_deletion_requests` and fulfill each request. Removing the database row alone is not account deletion. Set an internal process for removing the Auth user and personal data, while handling shared trip records as described in the privacy policy.
3. Log in with `eas login`, then in `mobile/` run `eas build:configure`. Set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `EXPO_PUBLIC_SITE_URL` in EAS Production and Preview. The publishable key is intended to be public; never use a service role key.
4. Run `eas build --platform android --profile preview` and test the APK on real Android devices: new-account OTP, existing-account OTP, profile, create trip, connect friend, one-person and group expenses, edit/delete, location deny/allow, close trip, UPI opening, payment confirmation/rejection, sign-out, privacy and deletion requests, offline/reconnect, and font scaling.
5. Run `eas build --platform android --profile production` to produce a signed `.aab`. Keep the generated keystore and Play App Signing relationship stable for future updates.
6. Create the app in Play Console with package `com.wayfare.trips`; provide screenshots captured from the real app, a feature graphic, support contact, content rating, target audience, app access instructions for review, privacy URL, deletion URL, and accurate Data safety declarations. The app uses email, profile name, optional UPI ID, trip and expense data, and optional foreground location. Do not claim payment processing or background tracking.
7. Upload the AAB to internal testing first. If the developer account is a personal account created after 13 November 2023, complete Google's closed test requirement before applying for production access. Review Play Console's current notices and policy declarations at submission time.

The app code targets Android 16 / API 36 through Expo SDK 58. Expo's Android compile SDK is 37. A JavaScript export and prebuild are not equivalent to installing and testing a signed native build.
