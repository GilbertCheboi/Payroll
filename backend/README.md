# Backend configuration

## Password reset email

Password-reset messages are sent through Zoho SMTP. Configure these values in
the deployment environment (the Docker Compose setup loads `images/.env`):

```dotenv
EMAIL_HOST=smtp.zoho.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
EMAIL_HOST_USER=info@agrieldo.com
EMAIL_HOST_PASSWORD=<Zoho app-specific password>
DEFAULT_FROM_EMAIL=Agrieldo Payroll <info@agrieldo.com>
FRONTEND_URL=https://payroll.agrieldo.com
```

Use the SMTP host for your Zoho account's data center if it differs from
`smtp.zoho.com`. Keep the app-specific password in the deployment secret store
or an ignored environment file; do not commit it to source control.

## Monthly billing invoices

The `billing_scheduler` Compose service checks for invoices hourly and emails
each organization's current invoice to its active administrators' valid email
addresses. Each message includes a downloadable PDF invoice attachment. It
uses the same `EMAIL_*` and `DEFAULT_FROM_EMAIL` SMTP configuration above.

Sent invoices are recorded so repeated checks do not resend them. SMTP failures
are logged and retried on a later check. If an organization has no valid admin
email address, its invoice is left unsent until one is available.

## Password reset SMS

Users can choose SMS verification instead of an email reset link. A short-lived
code is sent to the phone number on the matching account. After code
verification, the user receives a restricted, short-lived session that can
only open their profile and update its password. Configure Celcom iSMS in the
deployment environment or the ignored `images/.env` file:

```dotenv
SMS_GATEWAY_URL=https://isms.celcomafrica.com/api/services/sendsms/
SMS_API_KEY=<Celcom API key>
SMS_PARTNER_ID=<Celcom partner ID>
SMS_SHORTCODE=<approved sender shortcode>
```

Keep the API key in a secret store or ignored environment file, and never
commit it to source control.
For deployments with multiple backend processes, configure a shared cache
(such as the Redis cache configured by `REDIS_URL`) so a code issued by one
process can be verified by another.
