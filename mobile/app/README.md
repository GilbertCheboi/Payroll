# Agrieldo Payroll mobile

A bare React Native Community CLI project with native Android and iOS build files.
The existing Vite project is in `../frontend/`.

## Run

Install Node 20.19.4 or later and the React Native build tools for your platform.
From this directory, install dependencies with `npm ci` and start Metro with
`npm start`.

- Android needs JDK 17 and the Android SDK, including API 36 for the app and API 34 for the camera module. Run `npm run android` with a device or emulator connected.
- iOS needs macOS and Xcode. Run `bundle install`, then
  `bundle exec pod install --project-directory=ios`, then `npm run ios`.

Set the API URL in `src/config.js` to an HTTPS version of the Django backend
that includes the new routes. Apply the new payroll and users migrations to
the test database before using the new workflows. The app defaults to the
configured payroll domain. Use a test deployment and test accounts for validation.

Run `npm test` to verify the API contract and PIN rules locally.

## Employee workflow

- Sign in with an existing account and confirm a four-digit PIN. The PIN unlocks
  the saved session on launch, after sending the idle app to the background,
  or after **Lock app**. Five
  incorrect attempts, sign-out, or expiration requires the account password.
- Load pay history and save payslips and yearly P9 certificates through the
  phone's share sheet. Use **Leave** to submit a request or view its status.
- Tap **Check in** or **Check out** and scan the printed QR. Allow the camera and
  precise location when prompted. A successful scan shows the site and the
  server-recorded time in the site's time zone.
- Create a duty claim and add Transport, Lunch, or Other lines with receipts.
  Photograph a receipt or attach a PDF, JPEG, or PNG up to 5 MB. Submit the claim
  and check its status under **Expenses**.

## Administrator and accountant workflow

- Under **Work sites and access**, an administrator creates a site with coordinates,
  radius, and time zone, downloads the printable QR, and creates Accountant
  accounts. Replacing a QR immediately invalidates the old printout.
- Accountants open **Expenses** to inspect receipts and approve, reject, or return
  submitted claims. After paying, they enter a date, method, and optional reference
  to record the full payment. Employees can see the recorded payment.
- HR and Admin staff can manage leave, employees, departments, and payroll runs
  and export reports. Admins can manage HR accounts and organization billing.

Verify QR scanning, GPS permissions, receipt selection, PDF saving, and the
accountant workflow on both platforms before distributing the app.
