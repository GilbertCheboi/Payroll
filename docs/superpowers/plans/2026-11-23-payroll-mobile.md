# Payroll Mobile Implementation Plan

Use the approved payroll mobile design in the adjacent specs directory.

1. In mobile/app, establish bare React Native with Community CLI, secure authentication, organization selection, and the employee payroll dashboard. Test the request contract and session refresh with a fake transport, then export for iOS and Android.
2. Add organization- and owner-scoped payroll PDF actions and native saving. Verify PDF amounts against the web layouts and test documents belonging to other accounts and organizations. Port leave and profile workflows.
3. Add Django work sites and attendance events, admin QR management, and camera/location capture. Test location accuracy, server time, repeat submissions, and tenant isolation.
4. Add expense claim and receipt APIs, accountant access, and one reimbursement per claim. Test role permissions and private downloads. Connect staff and accountant screens.
5. Port the remaining HR and admin screens. Check each role's existing workflows and test the new flows on Android and iOS phones.
