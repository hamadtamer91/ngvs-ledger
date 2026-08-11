# NGVS Company Ledger — Production Setup

This is the real-backend version of your expense & payroll dashboard, running on
[Supabase](https://supabase.com) (Postgres + Auth) instead of the demo storage
used in the chat artifact. Real hashed passwords, server-enforced permissions,
one shared database for your whole team.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project (free tier is fine to start).
2. Wait for it to finish provisioning (~2 min).

## 2. Set up the database

1. In your project, open **SQL Editor → New query**.
2. Paste the entire contents of `schema.sql` and click **Run**.
   This creates every table, the balance-safe fund tracking, and all
   Row-Level Security rules (who can see/add/edit/delete what).

## 3. Create the first Admin account

1. Go to **Authentication → Users → Add user**.
2. Enter your email and a password, check **Auto Confirm User**, click Create.
   A database trigger automatically makes this first account an **Admin**.
3. Go to **Authentication → Settings** (or **Providers → Email**) and turn
   **off** "Allow new users to sign up". From now on, every other account
   must be created by an Admin from inside the app — nobody can self-register.

## 4. Deploy the create-user Edge Function

This function lets an Admin create teammate logins and reset passwords
securely (it uses a server-side key that never reaches the browser).

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy create-user
```

Your project ref and other IDs are on the project's **Settings → General** page.

## 5. Configure the app

1. Copy `.env.example` to `.env`.
2. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — both found under
   **Settings → API** in your Supabase project. The anon key is safe to use
   in the browser; Row-Level Security is what actually protects your data.

## 6. Run it locally

```bash
npm install
npm run dev
```

Open the local URL it prints, sign in with the Admin account from Step 3.

## 7. Deploy so your team can use it

Easiest path is [Vercel](https://vercel.com):

1. Push this folder to a GitHub repo.
2. In Vercel: New Project → import that repo.
3. Add the same two environment variables from your `.env` file in Vercel's
   project settings.
4. Deploy. You'll get a real URL your whole team can log into from any device.

## Day-to-day use

- **Admin** creates every teammate's login under the **Team** tab (name,
  email, temporary password, role). Share the password with them securely
  and have them change it later if you add that flow.
- **Admin or Accountant** can add departments and bank/cash accounts.
- Every expense requires a funding source and deducts from that account's
  balance the moment it's saved. Transfers move money between accounts
  atomically.
- All 9 reports filter by date range and export to CSV.

## What's genuinely different from the chat-artifact version

- Passwords are handled entirely by Supabase Auth — never touch your code.
- Every permission (who can add, edit, delete, manage users) is enforced
  in the database itself via Row-Level Security, not just hidden buttons.
- Data lives in a real Postgres database you can query, back up, and export
  independently of this app at any time.
