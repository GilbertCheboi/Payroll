# Payroll mobile app design

Build a bare React Native Community CLI app for Android and iOS over the existing Django REST API. The web app generates payroll PDFs in the browser today. Add authenticated Django PDF downloads based on the same payroll records and P9 data so the mobile app can preview, save, and share documents through the phone's file controls.

## Approach

Reuse Django for authentication, organization membership, payroll calculations, and permissions. Build native screens for the existing workflows and add Django endpoints for attendance and expenses. A web wrapper would reach existing screens sooner but would retain the browser experience for file downloads and require bridging the camera and location. Native screens provide a consistent experience for those workflows.

## Accounts and existing features

Staff use existing credentials and password recovery. After the first password sign-in, staff set and confirm a four-digit PIN. Store the PIN and refresh token in OS-backed secure storage. Require the account password after five failed PIN attempts, sign-out, or an expired session. Honor the active organization on every API call and clear organization-specific screen data on a switch. Preserve existing role access and billing behavior. Build a parity checklist from the current web routes covering signup and organization setup, dashboard and profile, payslips, P9, leave and approvals, employees, departments, HR accounts, payroll runs, reports, organization settings, and billing. Verify each workflow as the appropriate role.

Add an Accountant role with explicit organization-scoped permission to review expense claims, view their receipts, and record reimbursements. Allow administrators to assign the role. Audit existing role checks, including account management and payroll endpoints, before introducing the role. Require explicit server-side authorization for every workflow.

## Attendance

The dashboard shows Check in, Check out, and the latest recorded time. An administrator configures each site's coordinates, radius, and time zone and can print or replace its QR code. The same active QR works for both actions and identifies the site through an opaque, revocable token.

The app requests a fresh location reading only when the employee scans. Django validates the active site, organization, reading freshness and accuracy, and distance from the site. The server supplies the event time and the app displays it in the site's time zone. Record the employee, action, site, and timestamp. Require online confirmation and show a specific retry message for permission, location, or connectivity problems. Save events atomically, enforce one open shift per employee per organization, and make retries safe so a double tap or a lost response cannot create another event. Store the site and verification outcome for routine history.

The printed code can be copied. The location check limits ordinary off-site use and relies on the location reported by the phone.

## Duty expenses and reimbursement

An employee can draft a claim with a duty date and purpose. Each line has a category, amount, and receipt. Initial categories are Transport, Lunch, and Other. Support a photo or a file attachment and keep receipts private with permission checks on download. Employees can see their own claims and payment history.

The accountant reviews submitted claims for the active organization and can approve, reject, or return them with a note. A returned claim can be edited and resubmitted. Approval records the reviewer and approved total. After paying, the accountant enters the payment date, method, and reference when available. Start with M-Pesa, bank transfer, and cash. One reimbursement covers the full approved total and is recorded atomically with the status change to Reimbursed. The record includes who logged it and when. The employee can see the status, date, method, and amount. The app records payments made separately.

## Delivery and acceptance

1. Establish mobile sign-in, organization selection, employee dashboard, leave, and downloadable payroll documents. Compare payslip and P9 values with the web app.
2. Add site management and test printed-code attendance on physical phones, including valid scans, outside-radius scans, double taps, and incorrect organization access.
3. Add employee claims, private receipts, the accountant queue, and the reimbursement record. Test the full workflow, returned claims, duplicate payment attempts, and access between organizations.
4. Complete HR and Admin parity and verify each existing workflow as its intended role. Check the current migration history against the deployment database before introducing attendance and expense migrations.
