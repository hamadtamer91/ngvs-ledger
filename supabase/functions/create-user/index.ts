// Supabase Edge Function: create-user
// Only an authenticated Admin can call this. It uses the service_role key
// (kept secret on Supabase's servers, never shipped to the browser) to
// create a new login and assign its role.
//
// Deploy with:  supabase functions deploy create-user
// Call from the app with the caller's access token in the Authorization header.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json();
    const action = body.action || "create";

    // Bootstrap: create the very first Admin account. No caller auth required,
    // but only works while the profiles table is genuinely empty — so it can't
    // be used to inject extra accounts later.
    if (action === "bootstrap") {
      const { count } = await admin.from("profiles").select("*", { count: "exact", head: true });
      if ((count ?? 0) > 0) {
        return new Response(JSON.stringify({ error: "Setup already completed — sign in instead." }), { status: 403, headers: cors });
      }
      const { email, password, name } = body;
      if (!email || !password || !name) {
        return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: cors });
      }
      if (password.length < 6) {
        return new Response(JSON.stringify({ error: "Password needs 6+ characters" }), { status: 400, headers: cors });
      }
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { name },
      });
      if (createErr) return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: cors });
      // Trigger already inserted the profile as Admin (first-user rule) — just make sure the name matches.
      await admin.from("profiles").update({ name, role: "Admin" }).eq("id", created.user.id);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const callerToken = authHeader.replace("Bearer ", "");

    // Client scoped to the caller's own token, to verify who is calling
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser(callerToken);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: cors });
    }

    const { data: callerProfile, error: profileErr } = await admin
      .from("profiles").select("role, active").eq("id", userData.user.id).single();
    if (profileErr || callerProfile?.role !== "Admin" || !callerProfile.active) {
      return new Response(JSON.stringify({ error: "Only an active Admin can create accounts" }), { status: 403, headers: cors });
    }

    if (action === "reset_password") {
      const { userId, newPassword } = body;
      if (!userId || !newPassword || newPassword.length < 6) {
        return new Response(JSON.stringify({ error: "Missing userId or password too short" }), { status: 400, headers: cors });
      }
      const { error: rpErr } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
      if (rpErr) return new Response(JSON.stringify({ error: rpErr.message }), { status: 400, headers: cors });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: cors });
    }

    const { email, password, name, role } = body;
    if (!email || !password || !name || !["Admin", "Accountant", "Viewer"].includes(role)) {
      return new Response(JSON.stringify({ error: "Missing or invalid fields" }), { status: 400, headers: cors });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Password needs 6+ characters" }), { status: 400, headers: cors });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name },
    });
    if (createErr) return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: cors });

    // The on_auth_user_created trigger already inserted a profile row (default Viewer) — update it to the chosen role/name.
    await admin.from("profiles").update({ name, role }).eq("id", created.user.id);

    return new Response(JSON.stringify({ ok: true, id: created.user.id }), { status: 200, headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
