// supabase/functions/_shared/db.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// supabase/functions/_shared/http.ts
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
function json(body, status2 = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status: status2,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra }
  });
}
function fail(status2, code, message) {
  return json({ error: code, message }, status2);
}
function notConfigured(missing) {
  console.warn("[not_configured] missing:", missing.join(", "));
  return fail(503, "not_configured", "This feature is not configured yet. Please check back soon.");
}
function preflight(req) {
  return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null;
}
function env(name) {
  return (Deno.env.get(name) || "").trim();
}
function serviceKey() {
  return env("SUPABASE_SERVICE_ROLE_KEY") || env("SB_SECRET_KEY");
}

// supabase/functions/_shared/slots.ts
var SLOT_TIME_ZONE = "America/Chicago";
var DEFAULT_RULES = {
  timeZone: SLOT_TIME_ZONE,
  firstStartHour: 9,
  lastStartHour: 19,
  slotMinutes: 60,
  minNoticeMinutes: 60,
  daysAhead: 30,
  weekdays: [1, 2, 3, 4, 5]
};
var MINUTE = 6e4;
var DAY = 24 * 60 * MINUTE;
function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return new Date(value).getTime();
}
function leadIntervals(appointmentDates, timeMin, timeMax, durationMinutes) {
  const windowStart = toMs(timeMin);
  const windowEnd = toMs(timeMax);
  const duration = durationMinutes * MINUTE;
  const out = [];
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || duration <= 0) return out;
  for (const value of appointmentDates) {
    if (!value) continue;
    const start = toMs(value);
    if (!Number.isFinite(start)) continue;
    const end = start + duration;
    if (start < windowEnd && end > windowStart) {
      out.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    }
  }
  return out;
}
function bookingWindow(now, rules = DEFAULT_RULES) {
  const nowMs = toMs(now);
  return {
    timeMin: new Date(nowMs).toISOString(),
    timeMax: new Date(nowMs + rules.daysAhead * DAY + rules.slotMinutes * MINUTE).toISOString()
  };
}

// supabase/functions/_shared/db.ts
function adminClient() {
  const url = env("SUPABASE_URL");
  const key = serviceKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function hubUser(admin, req) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: profile } = await admin.from("hub_profiles").select("id, email, role, full_name").eq("id", data.user.id).maybeSingle();
  return profile ?? null;
}
function assistantSlotMinutes() {
  const raw = Number(env("SLOT_DURATION_MINUTES"));
  if (!Number.isInteger(raw) || raw < 30 || raw > 240) return 60;
  return raw;
}
async function bookedIntervals(admin, timeMin, timeMax, exceptAppointmentId) {
  const minDay = new Date(Date.parse(timeMin) - 3 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
  const maxDay = new Date(Date.parse(timeMax) + 2 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
  const [hub, leads] = await Promise.all([
    admin.from("hub_appointments").select("id, starts_at, ends_at").eq("status", "booked").lt("starts_at", timeMax).gt("ends_at", timeMin),
    admin.from("powergenie_customers").select("appointment_date").gte("appointment_date", minDay).lt("appointment_date", maxDay).limit(500)
  ]);
  if (hub.error) throw hub.error;
  if (leads.error) throw leads.error;
  const appointments = (hub.data ?? []).filter((r) => r.id !== exceptAppointmentId).map((r) => ({ start: r.starts_at, end: r.ends_at }));
  const assistant = leadIntervals(
    (leads.data ?? []).map((row) => row.appointment_date),
    timeMin,
    timeMax,
    assistantSlotMinutes()
  );
  return [...appointments, ...assistant];
}

// supabase/functions/_shared/calendar-sync.ts
var CONSULT_TIME_ZONE = "America/Chicago";
function isMissingCalendarEvent(error) {
  const status2 = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
  return status2 === 404 || status2 === 410;
}
function syncErrorMessage(error) {
  const message = error instanceof Error && error.message ? error.message : "Google Calendar sync failed";
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}
function syncSummary(results) {
  const failed = results.filter((result) => result.syncError);
  if (!failed.length) return null;
  const detail = failed[0].syncError || "Google Calendar sync failed";
  if (failed.length === results.length) return detail.slice(0, 500);
  return `${failed.length} of ${results.length} calendars failed. ${detail}`.slice(0, 500);
}
function availabilityMembers(members) {
  return members.filter((member) => member.role === "owner" || member.requiredForAvailability);
}
function blank(value) {
  return (value || "").trim();
}
function consultEventBody(details) {
  const phone = blank(details.phone);
  const email = blank(details.email);
  const address = blank(details.address);
  const note = blank(details.note);
  const intro = details.source === "assistant" ? "Booked by the website assistant." : details.source === "public" ? "Booked online via The Power Genie booking page." : "Added from The Power Genie dashboard.";
  const lines = [
    intro,
    "",
    `Customer: ${details.customerName}`,
    phone ? `Phone: ${phone}` : "",
    email ? `Email: ${email}` : "",
    address ? `Address: ${address}` : "",
    note ? `Note: ${note}` : "",
    "",
    details.hasLightBill ? "Light bill: uploaded. Open the lead below to view it. It is not attached here." : "Light bill: not uploaded.",
    "Open this lead in the Referral Hub:",
    details.dashboardUrl
  ].filter((line, index, all) => line !== "" || (all[index - 1] ?? "") !== "");
  return {
    summary: `Power Genie consult: ${details.customerName}`,
    location: address || void 0,
    description: lines.join("\n"),
    start: { dateTime: details.start, timeZone: CONSULT_TIME_ZONE },
    end: { dateTime: details.end, timeZone: CONSULT_TIME_ZONE },
    reminders: { useDefault: true },
    extendedProperties: { private: { powerGenieAppointmentId: details.id } }
  };
}
async function fanOutCalendars(args) {
  const prior = new Map(args.stored.map((row) => [row.userId, row]));
  return Promise.all(args.members.map(async (member) => {
    const existing = prior.get(member.userId);
    try {
      if (existing?.googleEventId) {
        try {
          await args.updateEvent(member, existing.googleEventId);
          return { userId: member.userId, googleEventId: existing.googleEventId, syncError: null };
        } catch (error) {
          if (!isMissingCalendarEvent(error)) throw error;
        }
      }
      const googleEventId = await args.createEvent(member);
      return { userId: member.userId, googleEventId, syncError: null };
    } catch (error) {
      return {
        userId: member.userId,
        googleEventId: existing?.googleEventId ?? null,
        syncError: syncErrorMessage(error)
      };
    }
  }));
}
async function removeCalendars(args) {
  const byUser = new Map(args.members.map((member) => [member.userId, member]));
  const rows = args.stored.filter((row) => row.googleEventId);
  return Promise.all(rows.map(async (row) => {
    const member = byUser.get(row.userId);
    if (!member) {
      return { userId: row.userId, error: "That member disconnected Google before the event could be removed." };
    }
    try {
      await args.deleteEvent(member, row.googleEventId);
      return { userId: row.userId, error: null };
    } catch (error) {
      return { userId: row.userId, error: syncErrorMessage(error) };
    }
  }));
}

// supabase/functions/_shared/notify.ts
var PRODUCTION_ORIGIN = "https://thepowergenie.theroyeffect.com";
function siteOrigin(configured) {
  const value = (configured || "").trim();
  if (!value) return PRODUCTION_ORIGIN;
  return value.replace(/\/+$/, "");
}
function dashboardLeadUrl(origin, id) {
  const base = origin.replace(/\/+$/, "");
  return `${base}/dashboard?tab=leads&id=${encodeURIComponent(id)}`;
}
function oneLine(value) {
  return value.replace(/\s+/g, " ").trim();
}
function splitList(value) {
  return (value || "").split(",").map((part) => part.trim()).filter(Boolean);
}
function leadAlertText(alert) {
  const source = alert.source === "assistant" ? "Website assistant" : alert.source === "dashboard" ? "Dashboard" : "Booking page";
  const kwh = alert.kwh == null ? "not on the bill" : `${Math.round(alert.kwh).toLocaleString("en-US")} kWh`;
  const amount = alert.amount == null ? "not on the bill" : alert.amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return [
    `New Power Genie lead (${source})`,
    `Name: ${oneLine(alert.name) || "not provided"}`,
    ...alert.phone ? [`Phone: ${oneLine(alert.phone)}`] : [],
    ...alert.email ? [`Email: ${oneLine(alert.email)}`] : [],
    `Address: ${oneLine(alert.address) || "not provided"}`,
    `kWh: ${kwh}`,
    `Amount: ${amount}`,
    `Appointment: ${oneLine(alert.appointment) || "not provided"}`,
    ...alert.source === "booking" ? ["Website solar consultation by phone or screen share. The service address is for the solar review."] : [],
    `Bill attached: ${alert.billAttached ? "yes" : "no"}`,
    alert.dashboardUrl
  ].join("\n");
}
function base64(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = new TextEncoder().encode(input);
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = index + 1 < bytes.length ? bytes[index + 1] : 0;
    const c = index + 2 < bytes.length ? bytes[index + 2] : 0;
    const triple = a << 16 | b << 8 | c;
    out += alphabet[triple >> 18 & 63];
    out += alphabet[triple >> 12 & 63];
    out += index + 1 < bytes.length ? alphabet[triple >> 6 & 63] : "=";
    out += index + 2 < bytes.length ? alphabet[triple & 63] : "=";
  }
  return out;
}
async function sendEmail(alert, env2, fetchImpl, text) {
  const key = env2.resendApiKey?.trim();
  const from = env2.notifyFrom?.trim();
  const to = splitList(env2.notifyEmailTo).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (!key || !from || to.length === 0) return "unconfigured";
  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "Idempotency-Key": alert.id
      },
      body: JSON.stringify({
        from,
        to,
        subject: `New Power Genie lead: ${oneLine(alert.name).slice(0, 80) || "New lead"}`,
        text
      })
    });
    if (!response.ok) console.error("lead_alert_email_failed", response.status);
    return response.ok ? "accepted" : "failed";
  } catch (error) {
    console.error("lead_alert_email_failed", error instanceof Error ? error.name : "unknown");
    return "failed";
  }
}
async function sendSms(alert, env2, fetchImpl, text) {
  const sid = env2.twilioAccountSid?.trim();
  const token = env2.twilioAuthToken?.trim();
  const from = env2.twilioFrom?.trim();
  const recipients = splitList(env2.notifySmsTo).filter((phone) => /^\+[1-9]\d{7,14}$/.test(phone));
  if (!sid || !token || !from || recipients.length === 0) return;
  const auth = base64(`${sid}:${token}`);
  await Promise.all(recipients.map(async (to) => {
    try {
      const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST",
        headers: {
          authorization: `Basic ${auth}`,
          "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ To: to, From: from, Body: text }).toString()
      });
      if (!response.ok) console.error("lead_alert_sms_failed", response.status);
    } catch (error) {
      console.error("lead_alert_sms_failed", error instanceof Error ? error.name : "unknown");
    }
  }));
}
async function sendLeadAlert(alert, env2, fetchImpl = fetch) {
  const text = leadAlertText(alert);
  try {
    const [status2] = await Promise.all([
      sendEmail(alert, env2, fetchImpl, text),
      sendSms(alert, env2, fetchImpl, text)
    ]);
    return status2;
  } catch (error) {
    console.error("lead_alert_failed", error instanceof Error ? error.name : "unknown");
    return "failed";
  }
}

// supabase/functions/_shared/google.ts
function googleConfigured() {
  return !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
}
var GoogleError = class extends Error {
  constructor(message, status2 = 0, reconnect = false) {
    super(message);
    this.status = status2;
    this.reconnect = reconnect;
  }
  status;
  reconnect;
};
var enc = new TextEncoder();
async function revokeToken(token) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {
  });
}
function missingRelation(error) {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204") return true;
  const message = (error.message || "").toLowerCase();
  return message.includes("does not exist") || message.includes("schema cache");
}
function asRole(value) {
  return value === "admin" ? "admin" : "owner";
}
async function loadProfiles(admin) {
  const { data, error } = await admin.from("hub_profiles").select("id, role, full_name, email");
  if (error) throw error;
  return data ?? [];
}
async function loadLegacyConnection(admin, profiles) {
  const { data, error } = await admin.from("hub_google_credentials").select("connected_by, calendar_id, google_email, connected_at, refresh_token").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data?.refresh_token) return null;
  const profile = profiles.find((row) => row.id === data.connected_by);
  return {
    userId: data.connected_by ?? null,
    role: asRole(profile?.role),
    fullName: profile?.full_name ?? null,
    calendarId: data.calendar_id,
    email: data.google_email,
    connectedAt: data.connected_at,
    refreshToken: data.refresh_token,
    requiredForAvailability: false
  };
}
async function loadConnections(admin) {
  const profiles = await loadProfiles(admin);
  const { data, error } = await admin.from("hub_google_accounts").select("user_id, google_email, calendar_id, refresh_token, required_for_availability, connected_at");
  if (error && missingRelation(error)) {
    const legacy2 = await loadLegacyConnection(admin, profiles);
    return legacy2 ? [legacy2] : [];
  }
  if (error) throw error;
  const connections = /* @__PURE__ */ new Map();
  for (const row of data ?? []) {
    if (!row.user_id || !row.refresh_token) continue;
    const profile = profiles.find((item) => item.id === row.user_id);
    connections.set(row.user_id, {
      userId: row.user_id,
      role: profile ? asRole(profile.role) : "admin",
      fullName: profile?.full_name ?? null,
      calendarId: row.calendar_id || "primary",
      email: row.google_email,
      connectedAt: row.connected_at,
      refreshToken: row.refresh_token,
      requiredForAvailability: row.required_for_availability === true
    });
  }
  const legacy = await loadLegacyConnection(admin, profiles).catch((error2) => {
    console.error("[calendar] legacy credentials", error2 instanceof Error ? error2.message : "unknown");
    return null;
  });
  if (legacy?.userId && !connections.has(legacy.userId)) connections.set(legacy.userId, legacy);
  return [...connections.values()];
}
async function availabilityBusy(admin, timeMin, timeMax) {
  if (!googleConfigured()) return [];
  const required = availabilityMembers(await loadConnections(admin));
  if (!required.length) return [];
  const lists = await Promise.all(required.map((connection) => freeBusy(connection, timeMin, timeMax)));
  return lists.flat();
}
var tokenCache = /* @__PURE__ */ new Map();
var tokenInflight = /* @__PURE__ */ new Map();
async function accessToken(conn) {
  const cached = tokenCache.get(conn.refreshToken);
  if (cached && cached.exp > Date.now() + 6e4) return cached.token;
  const pending = tokenInflight.get(conn.refreshToken);
  if (pending) return pending;
  const promise = refreshAccessToken(conn).finally(() => tokenInflight.delete(conn.refreshToken));
  tokenInflight.set(conn.refreshToken, promise);
  return promise;
}
async function refreshAccessToken(conn) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token"
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new GoogleError(`token refresh failed: ${data.error || res.status}`, res.status, data.error === "invalid_grant");
  }
  const token = data.access_token;
  tokenCache.set(conn.refreshToken, { token, exp: Date.now() + (Number(data.expires_in) || 3e3) * 1e3 });
  return token;
}
async function calendarFetch(conn, path, init = {}) {
  const token = await accessToken(conn);
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers || {} }
  });
  return res;
}
async function freeBusy(conn, timeMin, timeMax) {
  const res = await calendarFetch(conn, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin, timeMax, timeZone: SLOT_TIME_ZONE, items: [{ id: conn.calendarId }] })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(`freeBusy failed: ${res.status}`, res.status, res.status === 401);
  const cal = data.calendars?.[conn.calendarId];
  if (!cal || cal.errors && cal.errors.length) {
    throw new GoogleError(`freeBusy calendar error: ${JSON.stringify(cal?.errors ?? "missing")}`);
  }
  return cal.busy ?? [];
}
async function createEvent(conn, details) {
  const res = await calendarFetch(conn, `/calendars/${encodeURIComponent(conn.calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(consultEventBody(details))
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(`event create failed: ${res.status} ${data.error?.message ?? ""}`, res.status);
  return data.id;
}
async function updateEvent(conn, eventId, details) {
  const res = await calendarFetch(
    conn,
    `/calendars/${encodeURIComponent(conn.calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(consultEventBody(details)) }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError(`event update failed: ${res.status} ${data.error?.message ?? ""}`, res.status);
}
async function findEventId(conn, appointmentId) {
  const params = new URLSearchParams({
    privateExtendedProperty: `powerGenieAppointmentId=${appointmentId}`,
    maxResults: "1",
    singleEvents: "true"
  });
  const res = await calendarFetch(conn, `/calendars/${encodeURIComponent(conn.calendarId)}/events?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const id = data.items?.[0]?.id;
  return typeof id === "string" ? id : null;
}
async function deleteEvent(conn, eventId) {
  const res = await calendarFetch(conn, `/calendars/${encodeURIComponent(conn.calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE"
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new GoogleError(`event delete failed: ${res.status}`, res.status);
  }
}
function leadUrl(id) {
  return dashboardLeadUrl(siteOrigin(env("SITE_URL")), id);
}
async function placeEvent(conn, details) {
  const existing = await findEventId(conn, details.id);
  if (existing) {
    await updateEvent(conn, existing, details);
    return existing;
  }
  return createEvent(conn, details);
}
function addressable(connections) {
  return connections.filter((connection) => !!connection.userId);
}
async function loadStored(admin, target) {
  const column = target.kind === "appointment" ? "appointment_id" : "customer_id";
  const { data, error } = await admin.from("hub_calendar_events").select("user_id, google_event_id, sync_error").eq(column, target.id);
  if (error && missingRelation(error)) return { rows: [], missing: true };
  if (error) throw error;
  return {
    missing: false,
    rows: (data ?? []).map((row) => ({
      userId: row.user_id,
      googleEventId: row.google_event_id ?? null,
      syncError: row.sync_error ?? null
    }))
  };
}
async function saveStored(admin, target, results) {
  const column = target.kind === "appointment" ? "appointment_id" : "customer_id";
  for (const result of results) {
    const { data: existing, error: readError } = await admin.from("hub_calendar_events").select("id").eq(column, target.id).eq("user_id", result.userId).maybeSingle();
    if (readError) throw readError;
    const row = {
      appointment_id: target.kind === "appointment" ? target.id : null,
      customer_id: target.kind === "customer" ? target.id : null,
      user_id: result.userId,
      google_event_id: result.googleEventId,
      sync_error: result.syncError,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const { error } = existing ? await admin.from("hub_calendar_events").update(row).eq("id", existing.id) : await admin.from("hub_calendar_events").insert(row);
    if (error) throw error;
  }
}
function logFailures(target, results) {
  for (const result of results) {
    if (!result.syncError) continue;
    console.error("[calendar]", target.kind, target.id, result.userId, result.syncError);
  }
}
async function rememberAppointment(admin, appointmentId, members, results) {
  const owner = members.find((member) => member.role === "owner" && member.userId);
  const ownerResult = owner ? results.find((result) => result.userId === owner.userId) : void 0;
  const fallback = results.find((result) => result.googleEventId);
  const { error } = await admin.from("hub_appointments").update({
    google_event_id: ownerResult?.googleEventId ?? fallback?.googleEventId ?? null,
    google_sync_error: syncSummary(results)
  }).eq("id", appointmentId);
  if (error) throw error;
}
async function syncHubAppointment(admin, appt, extras = { hasLightBill: false }) {
  try {
    if (!googleConfigured() || appt.status === "cancelled") return null;
    const members = addressable(await loadConnections(admin));
    if (!members.length) return null;
    const target = { kind: "appointment", id: appt.id };
    const stored = await loadStored(admin, target);
    let rows = stored.rows;
    if (!rows.length && appt.google_event_id) {
      const owner = members.find((member) => member.role === "owner");
      if (owner) rows = [{ userId: owner.userId, googleEventId: appt.google_event_id, syncError: null }];
    }
    const details = {
      id: appt.id,
      start: appt.starts_at,
      end: appt.ends_at,
      customerName: appt.customer_name,
      phone: appt.phone,
      email: appt.email,
      address: appt.address,
      note: appt.note,
      dashboardUrl: leadUrl(appt.id),
      source: appt.source === "public" ? "public" : "dashboard",
      hasLightBill: extras.hasLightBill
    };
    const results = await fanOutCalendars({
      members,
      stored: rows,
      createEvent: (member) => placeEvent(member, details),
      updateEvent: (member, eventId) => updateEvent(member, eventId, details)
    });
    logFailures(target, results);
    if (!stored.missing) await saveStored(admin, target, results);
    await rememberAppointment(admin, appt.id, members, results);
    return syncSummary(results);
  } catch (error) {
    const message = syncErrorMessage(error);
    console.error("[calendar] appointment", appt.id, message);
    await admin.from("hub_appointments").update({ google_sync_error: message }).eq("id", appt.id);
    return message;
  }
}
async function syncCustomerConsult(admin, customer) {
  try {
    if (!googleConfigured()) return null;
    const members = addressable(await loadConnections(admin));
    if (!members.length) return null;
    const startMs = Date.parse(customer.appointment_date);
    if (!Number.isFinite(startMs)) return "Appointment time is not valid.";
    const target = { kind: "customer", id: customer.id };
    const stored = await loadStored(admin, target);
    if (stored.missing) {
      console.error("[calendar] hub_calendar_events is missing; apply the member calendar migration");
      return "Calendar sync is not set up yet.";
    }
    const noteLine = (customer.notes || "").split("\n").find((line) => line.startsWith("Preferred windows: "));
    const details = {
      id: customer.id,
      start: new Date(startMs).toISOString(),
      end: new Date(startMs + customer.durationMinutes * 6e4).toISOString(),
      customerName: customer.customer_name,
      phone: customer.phone,
      email: customer.email,
      address: customer.service_address,
      note: noteLine ? noteLine.slice("Preferred windows: ".length) : null,
      dashboardUrl: leadUrl(customer.id),
      source: "assistant",
      hasLightBill: (customer.notes || "").includes("Bill: attached")
    };
    const results = await fanOutCalendars({
      members,
      stored: stored.rows,
      createEvent: (member) => placeEvent(member, details),
      updateEvent: (member, eventId) => updateEvent(member, eventId, details)
    });
    logFailures(target, results);
    await saveStored(admin, target, results);
    return syncSummary(results);
  } catch (error) {
    const message = syncErrorMessage(error);
    console.error("[calendar] customer", customer.id, message);
    return message;
  }
}
var CANCEL_WARNING = "Cancelled here, but a Google Calendar event could not be removed. Delete it on the phone.";
async function deleteHubAppointmentEvents(admin, appointmentId, legacyEventId) {
  try {
    if (!googleConfigured()) return legacyEventId ? CANCEL_WARNING : null;
    const members = addressable(await loadConnections(admin));
    const target = { kind: "appointment", id: appointmentId };
    const stored = await loadStored(admin, target);
    let rows = stored.rows;
    if (!rows.some((row) => row.googleEventId) && legacyEventId) {
      const owner = members.find((member) => member.role === "owner");
      if (owner) rows = [...rows, { userId: owner.userId, googleEventId: legacyEventId, syncError: null }];
    }
    if (!rows.some((row) => row.googleEventId)) return null;
    const outcomes = await removeCalendars({
      members,
      stored: rows,
      deleteEvent: (member, eventId) => deleteEvent(member, eventId)
    });
    for (const outcome of outcomes) {
      if (outcome.error) console.error("[calendar] cancel", appointmentId, outcome.userId, outcome.error);
    }
    if (!stored.missing) {
      for (const outcome of outcomes) {
        const patch = outcome.error ? { sync_error: outcome.error, updated_at: (/* @__PURE__ */ new Date()).toISOString() } : { google_event_id: null, sync_error: null, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
        await admin.from("hub_calendar_events").update(patch).eq("appointment_id", appointmentId).eq("user_id", outcome.userId);
      }
    }
    const failed = outcomes.some((outcome) => outcome.error);
    await admin.from("hub_appointments").update({ google_event_id: failed ? legacyEventId : null, google_sync_error: failed ? CANCEL_WARNING : null }).eq("id", appointmentId);
    return failed ? CANCEL_WARNING : null;
  } catch (error) {
    console.error("[calendar] cancel", appointmentId, syncErrorMessage(error));
    return CANCEL_WARNING;
  }
}

// supabase/functions/_shared/appointment-alert.ts
async function notifyAppointment(admin, alert, startsAt, includeTeam = true) {
  const { data: owners } = await admin.from("hub_profiles").select("email").eq("role", "owner");
  const recipients = (owners ?? []).map((owner) => String(owner.email || "").trim().toLowerCase()).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  const settings = { resendApiKey: env("RESEND_API_KEY"), notifyFrom: env("NOTIFY_FROM") };
  const revision = new Date(startsAt).toISOString();
  const message = {
    ...alert,
    id: alert.id + "-" + Date.parse(revision),
    appointment: new Date(revision).toLocaleString("en-US", { timeZone: "America/Chicago", timeZoneName: "short" })
  };
  const status2 = await sendLeadAlert(message, { ...settings, notifyEmailTo: recipients.join(",") });
  const { error } = await admin.from("hub_appointments").update({ owner_email_status: status2 }).eq("id", alert.id).eq("starts_at", revision);
  if (error) console.error("appointment_email_status_write_failed", error.code);
  if (includeTeam) {
    const others = (env("NOTIFY_EMAIL_TO") || "").split(",").filter((email) => !recipients.includes(email.trim().toLowerCase()));
    await sendLeadAlert({ ...message, id: message.id + "-team" }, {
      ...settings,
      notifyEmailTo: others.join(","),
      twilioAccountSid: env("TWILIO_ACCOUNT_SID"),
      twilioAuthToken: env("TWILIO_AUTH_TOKEN"),
      twilioFrom: env("TWILIO_FROM"),
      notifySmsTo: env("NOTIFY_SMS_TO")
    });
  }
  return status2;
}

// supabase/functions/schedule/index.ts
async function emailBooking(admin, a, includeTeam) {
  const { count } = await admin.from("hub_appointment_files").select("id", { head: true, count: "exact" }).eq("appointment_id", a.id).eq("kind", "light_bill");
  return notifyAppointment(admin, {
    id: a.id,
    source: a.source === "public" ? "booking" : "dashboard",
    name: a.customer_name,
    email: a.email,
    phone: a.phone,
    address: a.address || "",
    kwh: a.kwh ?? null,
    amount: a.bill_amount ?? null,
    appointment: new Date(a.starts_at).toLocaleString("en-US", { timeZone: SLOT_TIME_ZONE, timeZoneName: "short" }),
    billAttached: !!count,
    dashboardUrl: dashboardLeadUrl(siteOrigin(env("SITE_URL")), a.id)
  }, a.starts_at, includeTeam);
}
var MINUTE2 = 6e4;
function publicMember(connection) {
  return {
    userId: connection.userId,
    fullName: connection.fullName,
    role: connection.role,
    requiredForAvailability: connection.role === "owner" || connection.requiredForAvailability
  };
}
async function status(admin, user) {
  const configured = googleConfigured();
  const connections = configured ? await loadConnections(admin) : [];
  const mine = connections.find((connection) => connection.userId === user.id) ?? null;
  const google = {
    configured,
    connected: !!mine,
    email: mine?.email ?? null,
    connectedAt: mine?.connectedAt ?? null,
    error: null,
    needsReconnect: false
  };
  let busy = [];
  if (mine) {
    const { timeMin, timeMax } = bookingWindow(/* @__PURE__ */ new Date());
    try {
      busy = await freeBusy(mine, timeMin, timeMax);
    } catch (e) {
      console.error("[schedule:status]", e);
      google.error = "Could not reach Google Calendar.";
      google.needsReconnect = e instanceof GoogleError && e.reconnect;
    }
  }
  return json({
    timeZone: SLOT_TIME_ZONE,
    google,
    members: connections.filter((connection) => connection.userId).map(publicMember),
    busy
  });
}
async function create(admin, user, body) {
  const str = (k, max) => typeof body[k] === "string" ? body[k].trim().slice(0, max) : "";
  const name = str("name", 120);
  const start = new Date(str("start", 40));
  const duration = Number(body.durationMinutes ?? 60);
  if (!name) return fail(400, "invalid", "Customer name is required.");
  if (Number.isNaN(start.getTime())) return fail(400, "invalid", "Pick a valid start time.");
  if (start.getTime() % (15 * MINUTE2) !== 0) return fail(400, "invalid", "Start times must be on a 15-minute mark.");
  if (!Number.isInteger(duration) || duration < 15 || duration > 480) return fail(400, "invalid", "Duration must be 15\u2013480 minutes.");
  if (start.getTime() < Date.now() - 5 * MINUTE2) return fail(400, "invalid", "That time is in the past.");
  const end = new Date(start.getTime() + duration * MINUTE2);
  const clash = await bookedIntervals(admin, start.toISOString(), end.toISOString());
  if (clash.length) return fail(409, "slot_unavailable", "That time overlaps another appointment.");
  if (googleConfigured() && body.ignoreGoogleBusy !== true) {
    try {
      const busy = await availabilityBusy(admin, start.toISOString(), end.toISOString());
      if (busy.length) {
        return fail(409, "google_busy", "That time is busy on the calendar used for availability. Add it anyway?");
      }
    } catch (e) {
      console.error("[schedule:create:freebusy]", e);
      return fail(503, "calendar_unavailable", "Could not check Google Calendar. Try again, or reconnect it.");
    }
  }
  const { data: appt, error } = await admin.from("hub_appointments").insert({
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    source: "dashboard",
    customer_name: name,
    phone: str("phone", 40) || null,
    email: str("email", 254).toLowerCase() || null,
    address: str("address", 300) || null,
    note: str("note", 1e3) || null,
    created_by: user.id
  }).select("*").single();
  if (error || !appt) {
    if (error?.code === "23P01") return fail(409, "slot_unavailable", "That time overlaps another appointment.");
    console.error("[schedule:create]", error);
    return fail(500, "save_failed", "Could not save the appointment.");
  }
  const warning = await syncHubAppointment(admin, appt, { hasLightBill: false });
  await emailBooking(admin, appt, true);
  return json({ ok: true, id: appt.id, warning });
}
async function syncToGoogle(admin, id) {
  const { data: a } = await admin.from("hub_appointments").select("*").eq("id", id).single();
  if (!a || a.status !== "booked") return "Appointment not found.";
  const connections = googleConfigured() ? await loadConnections(admin) : [];
  if (!connections.length) return "Google Calendar is not connected.";
  const { count } = await admin.from("hub_appointment_files").select("id", { count: "exact", head: true }).eq("appointment_id", id);
  return syncHubAppointment(admin, a, { hasLightBill: (count ?? 0) > 0 });
}
async function reschedule(admin, body) {
  const id = String(body.id || "");
  const start = new Date(typeof body.start === "string" ? body.start : "");
  const duration = Number(body.durationMinutes ?? 60);
  if (!id) return fail(400, "invalid", "Appointment not found.");
  if (Number.isNaN(start.getTime())) return fail(400, "invalid", "Pick a valid start time.");
  if (start.getTime() % (15 * MINUTE2) !== 0) return fail(400, "invalid", "Start times must be on a 15-minute mark.");
  if (!Number.isInteger(duration) || duration < 15 || duration > 480) return fail(400, "invalid", "Duration must be 15\u2013480 minutes.");
  if (start.getTime() < Date.now() - 5 * MINUTE2) return fail(400, "invalid", "That time is in the past.");
  const end = new Date(start.getTime() + duration * MINUTE2);
  const { data: current } = await admin.from("hub_appointments").select("*").eq("id", id).maybeSingle();
  if (!current || current.status !== "booked") return fail(404, "not_found", "Appointment not found.");
  const clash = await bookedIntervals(admin, start.toISOString(), end.toISOString(), id);
  if (clash.length) return fail(409, "slot_unavailable", "That time overlaps another appointment.");
  if (googleConfigured() && body.ignoreGoogleBusy !== true) {
    try {
      const busy = await availabilityBusy(admin, start.toISOString(), end.toISOString());
      const ownStart = new Date(current.starts_at).getTime();
      const ownEnd = new Date(current.ends_at).getTime();
      const otherBusy = busy.filter((block) => new Date(block.start).getTime() !== ownStart || new Date(block.end).getTime() !== ownEnd);
      if (otherBusy.length) {
        return fail(409, "google_busy", "That time is busy on the calendar used for availability. Add it anyway?");
      }
    } catch (e) {
      console.error("[schedule:reschedule:freebusy]", e);
      return fail(503, "calendar_unavailable", "Could not check Google Calendar. Try again, or reconnect it.");
    }
  }
  const { data: appt, error } = await admin.from("hub_appointments").update({ starts_at: start.toISOString(), ends_at: end.toISOString(), owner_email_status: null }).eq("id", id).select("*").single();
  if (error || !appt) {
    if (error?.code === "23P01") return fail(409, "slot_unavailable", "That time overlaps another appointment.");
    console.error("[schedule:reschedule]", error);
    return fail(500, "save_failed", "Could not move the appointment.");
  }
  const { count } = await admin.from("hub_appointment_files").select("id", { count: "exact", head: true }).eq("appointment_id", id);
  const syncError = await syncHubAppointment(admin, appt, { hasLightBill: (count ?? 0) > 0 });
  await emailBooking(admin, appt, true);
  return json({ ok: true, warning: syncError });
}
async function cancel(admin, user, id) {
  const { data: a } = await admin.from("hub_appointments").select("id, status, google_event_id").eq("id", id).maybeSingle();
  if (!a) return fail(404, "not_found", "Appointment not found.");
  if (a.status === "cancelled") return json({ ok: true });
  const { error } = await admin.from("hub_appointments").update({ status: "cancelled", cancelled_at: (/* @__PURE__ */ new Date()).toISOString(), cancelled_by: user.id }).eq("id", id);
  if (error) return fail(500, "save_failed", "Could not cancel the appointment.");
  const warning = await deleteHubAppointmentEvents(admin, id, a.google_event_id);
  return json({ ok: true, warning });
}
async function resyncCustomer(admin, id) {
  if (!id) return "Appointment not found.";
  const { data, error } = await admin.from("powergenie_customers").select("id, customer_name, phone, email, service_address, notes, appointment_date").eq("id", id).maybeSingle();
  if (error || !data?.appointment_date) return "Appointment not found.";
  const raw = Number(env("SLOT_DURATION_MINUTES"));
  const durationMinutes = Number.isInteger(raw) && raw >= 30 && raw <= 240 ? raw : 60;
  return syncCustomerConsult(admin, { ...data, durationMinutes });
}
async function disconnect(admin, user) {
  const connections = googleConfigured() ? await loadConnections(admin) : [];
  const mine = connections.find((connection) => connection.userId === user.id);
  if (mine) await revokeToken(mine.refreshToken);
  const accounts = await admin.from("hub_google_accounts").delete().eq("user_id", user.id);
  if (accounts.error && !missingRelation(accounts.error)) throw accounts.error;
  const legacy = await admin.from("hub_google_credentials").delete().eq("connected_by", user.id);
  if (legacy.error && !missingRelation(legacy.error)) throw legacy.error;
  return json({ ok: true });
}
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");
  const admin = adminClient();
  if (!admin) return notConfigured(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const user = await hubUser(admin, req);
  if (!user) return fail(401, "unauthorized", "Please sign in to the dashboard.");
  let body = {};
  try {
    body = await req.json();
  } catch {
  }
  const action = String(body.action || "status");
  try {
    if (action === "status") return await status(admin, user);
    if (action === "disconnect") return await disconnect(admin, user);
    if (action === "resync" || action === "resync_customer") {
      const err = action === "resync" ? await syncToGoogle(admin, String(body.id || "")) : await resyncCustomer(admin, String(body.id || ""));
      return err ? fail(502, "sync_failed", err) : json({ ok: true });
    }
    if (action === "create") return await create(admin, user, body);
    if (user.role !== "owner") return fail(403, "forbidden", "Only the owner can reschedule or cancel appointments.");
    if (action === "retry_owner_email") {
      const { data: a } = await admin.from("hub_appointments").select("*").eq("id", String(body.id || "")).eq("status", "booked").maybeSingle();
      if (!a) return fail(404, "not_found", "Appointment not found.");
      const status2 = a.owner_email_status === "accepted" ? "accepted" : await emailBooking(admin, a, false);
      return json({ status: status2 });
    }
    if (action === "reschedule") return await reschedule(admin, body);
    if (action === "cancel") return await cancel(admin, user, String(body.id || ""));
    return fail(400, "bad_request", "Unknown action.");
  } catch (e) {
    console.error("[schedule]", e);
    return fail(500, "server_error", "Something went wrong.");
  }
});
