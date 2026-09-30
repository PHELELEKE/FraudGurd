# Accounts and passwords

| Who | Can do |
|---|---|
| Anyone | Register as an **Employee** (login page, "Register as an employee"). Reset an employee password from the login page ("Forgot password?"). |
| Employee | Change own password on **My account** (needs the current password). |
| Manager | Create users of every other role, and reset anyone's password, on **Users**. Change own password on **My account**. |
| Finance Manager | Reset the **Manager's** password on **Users**. Nothing else there. |
| Procurement, Accountant, Auditor | Cannot change their password. They ask the Manager to reset it. |

Notes

- When the Manager (or Finance Manager) sets a password for an Employee or Manager, that person must choose their own at next sign-in.
- Resetting or changing a password signs that user out everywhere else.
- Reset links work once and expire after 30 minutes. Only a hash is stored.
- Everything is written to the audit trail. Passwords are never logged.
- Email: set `BREVO_API_KEY` (or `RESEND_API_KEY`) and `MAIL_FROM` in Netlify. With no key and `DEMO_MODE` not `false`, the reset link is shown on screen.
- Optional `SIGNUP_CODE` limits who can register.
- Run `npm run db:setup` once after updating (adds columns and a table, safe to repeat).
