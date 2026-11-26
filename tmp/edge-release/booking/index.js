// supabase/functions/_shared/bill.ts
function clip(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}
function numberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
function bounded(value, min, max) {
  if (value == null) return null;
  if (value < min || value > max) return null;
  return value;
}
function roundTenth(value) {
  return Math.round(value * 10) / 10;
}
function normalizeEsiid(value) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 17 || digits.length > 22) return null;
  return digits;
}
function normalizeMeter(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^A-Za-z0-9-]/g, "");
  if (!cleaned) return null;
  return cleaned.slice(0, 40);
}
function normalizeCertificate(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 4 || digits.length > 12) return null;
  return digits;
}
function usageMonth(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1990 || year > 2100 || month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}`;
}
function normalizeUsage(value) {
  if (!Array.isArray(value)) return null;
  const byMonth = /* @__PURE__ */ new Map();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item;
    const month = usageMonth(record.month);
    const kwh = bounded(numberOrNull(record.kwh), 0, 1e5);
    if (!month || kwh == null) continue;
    byMonth.set(month, roundTenth(kwh));
  }
  if (byMonth.size === 0) return null;
  const points = [...byMonth.entries()].sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0).map(([month, kwh]) => ({ month, kwh }));
  return points.length > 36 ? points.slice(-36) : points;
}
function normalizeBill(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const billDate = clip(source.billDate, 40);
  const isoDate = billDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const slashDate = billDate?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  let date = billDate;
  if (isoDate) date = `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  else if (slashDate) {
    date = `${slashDate[3]}-${slashDate[1].padStart(2, "0")}-${slashDate[2].padStart(2, "0")}`;
  }
  const avg = bounded(numberOrNull(source.avgMonthlyKwh), 0, 1e5);
  return {
    customerName: clip(source.customerName, 120),
    serviceAddress: clip(source.serviceAddress, 240),
    utility: clip(source.utility, 80),
    accountNumber: clip(typeof source.accountNumber === "string" ? source.accountNumber.replace(/\s+/g, "") : source.accountNumber, 40),
    billDate: date,
    ratePlan: clip(source.ratePlan, 40),
    kwhThisPeriod: bounded(numberOrNull(source.kwhThisPeriod), 0, 1e5),
    days: bounded(numberOrNull(source.days), 1, 400),
    kwhSameMonthLastYear: bounded(numberOrNull(source.kwhSameMonthLastYear), 0, 1e5),
    currentCharges: bounded(numberOrNull(source.currentCharges), -1e5, 1e6),
    totalDue: bounded(numberOrNull(source.totalDue), -1e5, 1e6),
    pastDue: bounded(numberOrNull(source.pastDue), -1e5, 1e6),
    esiid: normalizeEsiid(source.esiid),
    meterNumber: normalizeMeter(source.meterNumber),
    tdu: clip(source.tdu, 80),
    repPuctCertificate: normalizeCertificate(source.repPuctCertificate),
    avgMonthlyKwh: avg == null ? null : roundTenth(avg),
    usageHistory: normalizeUsage(source.usageHistory)
  };
}
function fieldsFromExtractPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("fields" in payload)) return null;
  return normalizeBill(payload.fields);
}
function billAmount(bill) {
  if (!bill) return null;
  if (bill.totalDue != null) return bill.totalDue;
  return bill.currentCharges;
}

// supabase/functions/_shared/meter.ts
var METER_CONSENT_TEXT = "I agree to share my Smart Meter Texas electricity usage with The Power Genie so Horace can review it before our call. Smart Meter Texas will email me to approve this. I can say no and still book the call.";
function emailOk(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function validateEsiId(value) {
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{17,22}$/.test(digits) ? digits : null;
}
function validateMeterNumber(value) {
  const cleaned = value.trim();
  if (!/^[A-Za-z0-9-]{1,30}$/.test(cleaned)) return null;
  return cleaned;
}
function readMeterRequest(input, fallbackEmail) {
  const blank2 = !input.esiId.trim() && !input.meterNumber.trim() && !input.email.trim() && !input.consent;
  if (blank2) return { ok: true, value: null };
  if (!input.consent) {
    return { ok: false, message: "Check the box to share usage, or leave the meter fields blank." };
  }
  const esiId = validateEsiId(input.esiId);
  if (!esiId) return { ok: false, message: "Enter the ESI ID from the bill. It is 17 to 22 digits." };
  const meterNumber = validateMeterNumber(input.meterNumber);
  if (!meterNumber) return { ok: false, message: "Enter the meter number from the bill." };
  const email = input.email.trim() || fallbackEmail.trim();
  if (!emailOk(email) || email.length > 64) return { ok: false, message: "Enter the email Smart Meter Texas should use." };
  return { ok: true, value: { esiId, meterNumber, email, consent: true } };
}

// supabase/functions/_shared/bill-file.ts
var HEIF_BRANDS = /* @__PURE__ */ new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "heif", "mif1", "msf1"]);
var GENERIC_HEIF = /* @__PURE__ */ new Set(["mif1", "msf1", "heif"]);
var BILL_MEDIA_TYPES = /* @__PURE__ */ new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);
function extensionForMedia(mediaType) {
  if (mediaType === "application/pdf") return "pdf";
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/webp") return "webp";
  if (mediaType === "image/heic") return "heic";
  if (mediaType === "image/heif") return "heif";
  return "jpg";
}
function ascii(bytes, from, to) {
  if (from < 0 || to > bytes.length || to < from) return "";
  let out = "";
  for (let i = from; i < to; i++) out += String.fromCharCode(bytes[i]);
  return out;
}
function sniffBill(bytes) {
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") return { ext: "pdf", type: "application/pdf" };
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return { ext: "jpg", type: "image/jpeg" };
  }
  if (bytes.length >= 8 && bytes[0] === 137 && ascii(bytes, 1, 4) === "PNG") return { ext: "png", type: "image/png" };
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return { ext: "webp", type: "image/webp" };
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12).toLowerCase();
    if (HEIF_BRANDS.has(brand)) {
      return GENERIC_HEIF.has(brand) ? { ext: "heif", type: "image/heif" } : { ext: "heic", type: "image/heic" };
    }
  }
  return null;
}

// supabase/functions/_shared/db.ts
import { createClient } from "npm:@supabase/supabase-js@2";

// supabase/functions/_shared/http.ts
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra }
  });
}
function fail(status, code, message) {
  return json({ error: code, message }, status);
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
var formatterCache = /* @__PURE__ */ new Map();
function formatter(timeZone) {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short"
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}
var WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function localParts(ms, timeZone) {
  const parts = {};
  for (const p of formatter(timeZone).formatToParts(new Date(ms))) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday] ?? 0
  };
}
function zonedTimeToUtc(year, month, day, hour, minute, timeZone) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = localParts(guess, timeZone);
    const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = target - asIfUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}
function overlaps(aStart, aEnd, busy) {
  return busy.some((b) => b.s < aEnd && b.e > aStart);
}
function normalizeBusy(busy) {
  return busy.map((b) => ({ s: toMs(b.start), e: toMs(b.end) })).filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e) && b.e > b.s);
}
function candidateSlots(nowMs, rules) {
  const earliest = nowMs + rules.minNoticeMinutes * MINUTE;
  const latest = nowMs + rules.daysAhead * DAY;
  const today = localParts(nowMs, rules.timeZone);
  const out = [];
  const base = Date.UTC(today.year, today.month - 1, today.day, 12);
  for (let d = 0; d <= rules.daysAhead + 1; d++) {
    const date = new Date(base + d * DAY);
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const weekday = date.getUTCDay();
    if (!rules.weekdays.includes(weekday)) continue;
    for (let h = rules.firstStartHour; h <= rules.lastStartHour; h++) {
      const start = zonedTimeToUtc(y, m, day, h, 0, rules.timeZone);
      if (start < earliest || start > latest) continue;
      out.push(start);
    }
  }
  return out;
}
function generateSlots(now, busy = [], rules = DEFAULT_RULES) {
  const nowMs = toMs(now);
  const blocks = normalizeBusy(busy);
  const len = rules.slotMinutes * MINUTE;
  return candidateSlots(nowMs, rules).filter((s) => !overlaps(s, s + len, blocks)).map((s) => ({ start: new Date(s).toISOString(), end: new Date(s + len).toISOString() }));
}
function isBookableSlot(start, now, busy = [], rules = DEFAULT_RULES) {
  const startMs = toMs(start);
  if (!Number.isFinite(startMs)) return false;
  const nowMs = toMs(now);
  if (!candidateSlots(nowMs, rules).includes(startMs)) return false;
  return !overlaps(startMs, startMs + rules.slotMinutes * MINUTE, normalizeBusy(busy));
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
    const [status] = await Promise.all([
      sendEmail(alert, env2, fetchImpl, text),
      sendSms(alert, env2, fetchImpl, text)
    ]);
    return status;
  } catch (error) {
    console.error("lead_alert_failed", error instanceof Error ? error.name : "unknown");
    return "failed";
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
  const status = await sendLeadAlert(message, { ...settings, notifyEmailTo: recipients.join(",") });
  const { error } = await admin.from("hub_appointments").update({ owner_email_status: status }).eq("id", alert.id).eq("starts_at", revision);
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
  return status;
}

// supabase/functions/_shared/read-bill.ts
async function readUploadedBill(admin, bytes, mediaType) {
  if (!BILL_MEDIA_TYPES.has(mediaType)) {
    console.error("booking_bill_extract_skipped", mediaType || "unknown");
    return null;
  }
  const key = env("EXTRACT_SHARED_SECRET") || serviceKey();
  const site = siteOrigin(env("SITE_URL"));
  if (!key) {
    console.error("booking_bill_extract_skipped", "no_extract_auth");
    return null;
  }
  const uploadId = crypto.randomUUID();
  const path = `pending/${uploadId}/light-bill.${extensionForMedia(mediaType)}`;
  const uploaded = await admin.storage.from("powergenie").upload(path, bytes, { contentType: mediaType, upsert: false });
  if (uploaded.error) {
    console.error("booking_bill_extract_upload_failed", uploaded.error.message);
    return null;
  }
  try {
    const response = await fetch(`${site}/api/assistant?route=extract`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ path }),
      signal: AbortSignal.timeout(5e4)
    });
    if (!response.ok) {
      console.error("booking_bill_extract_failed", response.status);
      return null;
    }
    const payload = await response.json().catch(() => null);
    return fieldsFromExtractPayload(payload);
  } catch (error) {
    console.error("booking_bill_extract_failed", error instanceof Error ? error.name : "unknown");
    return null;
  } finally {
    await admin.storage.from("powergenie").remove([path]).catch(() => {
    });
  }
}

// supabase/functions/_shared/calendar-sync.ts
var CONSULT_TIME_ZONE = "America/Chicago";
function isMissingCalendarEvent(error) {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
  return status === 404 || status === 410;
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

// supabase/functions/_shared/google.ts
function googleConfigured() {
  return !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"));
}
var GoogleError = class extends Error {
  constructor(message, status = 0, reconnect = false) {
    super(message);
    this.status = status;
    this.reconnect = reconnect;
  }
  status;
  reconnect;
};
var enc = new TextEncoder();
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

// supabase/functions/booking/index.ts
var MAX_BILL_BYTES = 10 * 1024 * 1024;
var BILL_BUCKET = "hub-light-bills";
var REQUIRE_LIGHT_BILL = false;
var MAX_BOOKINGS_PER_IP_PER_DAY = 3;
var MAX_PUBLIC_BOOKINGS_PER_DAY = 25;
async function ipHash(req) {
  const ip = req.headers.get("cf-connecting-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${serviceKey()}|${ip}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function abuseCheck(admin, ipKey, email) {
  const since = new Date(Date.now() - 24 * 36e5).toISOString();
  const [perIp, siteWide, existing] = await Promise.all([
    admin.from("hub_appointments").select("id", { count: "exact", head: true }).eq("source", "public").eq("client_ip_hash", ipKey).gte("created_at", since),
    admin.from("hub_appointments").select("id", { count: "exact", head: true }).eq("source", "public").gte("created_at", since),
    admin.from("hub_appointments").select("id", { count: "exact", head: true }).eq("status", "booked").eq("email", email).gt("starts_at", (/* @__PURE__ */ new Date()).toISOString())
  ]);
  if (perIp.error || siteWide.error || existing.error) throw perIp.error || siteWide.error || existing.error;
  if ((existing.count ?? 0) > 0) {
    return fail(409, "already_booked", "You already have an upcoming consultation. Call 510-241-7007 to change it.");
  }
  if ((perIp.count ?? 0) >= MAX_BOOKINGS_PER_IP_PER_DAY || (siteWide.count ?? 0) >= MAX_PUBLIC_BOOKINGS_PER_DAY) {
    return fail(429, "rate_limited", "Too many bookings right now. Please call 510-241-7007 and we will get you scheduled.");
  }
  return null;
}
async function busyTime(admin, now) {
  const { timeMin, timeMax } = bookingWindow(now);
  const busy = await bookedIntervals(admin, timeMin, timeMax);
  if (googleConfigured()) busy.push(...await availabilityBusy(admin, timeMin, timeMax));
  return busy;
}
function clean(value, max) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}
async function checkBill(file) {
  if (file.size === 0) return "The light bill file is empty.";
  if (file.size > MAX_BILL_BYTES) return "The light bill must be 10 MB or smaller.";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffBill(bytes);
  if (!kind) return "We couldn't read that file. Please upload a PDF, JPG, PNG, WEBP, or HEIC photo.";
  return { kind, bytes };
}
async function listSlots(admin) {
  const now = /* @__PURE__ */ new Date();
  try {
    const busy = await busyTime(admin, now);
    return json({ supportsReferralFields: true, timeZone: SLOT_TIME_ZONE, slotMinutes: DEFAULT_RULES.slotMinutes, slots: generateSlots(now, busy) });
  } catch (e) {
    console.error("[booking:list]", e);
    return fail(503, "calendar_unavailable", "Online booking is temporarily unavailable. Please call or try again shortly.");
  }
}
async function book(admin, req) {
  let form;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad_request", "Please submit the booking form again.");
  }
  if (clean(form.get("website"), 200)) return json({ ok: true });
  const start = clean(form.get("start"), 40);
  const name = clean(form.get("name"), 120);
  const phone = clean(form.get("phone"), 40);
  const email = clean(form.get("email"), 254).toLowerCase();
  const address = clean(form.get("address"), 300);
  const note = typeof form.get("note") === "string" ? String(form.get("note")).trim().slice(0, 1e3) : "";
  if (!name) return fail(400, "invalid", "Please enter your name.");
  if ((phone.match(/\d/g) || []).length < 10) return fail(400, "invalid", "Please enter a phone number with area code.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail(400, "invalid", "Please enter a valid email address.");
  if (address.length < 5) return fail(400, "invalid", "Please enter the service address.");
  const meterResult = readMeterRequest({
    esiId: clean(form.get("meterEsiId"), 40),
    meterNumber: clean(form.get("meterNumber"), 40),
    email: clean(form.get("meterEmail"), 80),
    consent: clean(form.get("meterConsent"), 8) === "yes"
  }, email);
  if (!meterResult.ok) return fail(400, "invalid_meter", meterResult.message);
  const startDate = new Date(start);
  if (!start || Number.isNaN(startDate.getTime())) return fail(400, "invalid", "Please choose a time.");
  const ipKey = await ipHash(req);
  try {
    const refused = await abuseCheck(admin, ipKey, email);
    if (refused) return refused;
  } catch (e) {
    console.error("[booking:abuse-check]", e);
    return fail(503, "unavailable", "We couldn't take bookings right now. Please try again in a minute.");
  }
  let bill = null;
  const file = form.get("bill");
  if (file instanceof File && file.size > 0) {
    const checked = await checkBill(file);
    if (typeof checked === "string") return fail(400, "invalid_file", checked);
    bill = { ...checked, name: file.name.slice(0, 200) };
  } else if (REQUIRE_LIGHT_BILL) {
    return fail(400, "invalid_file", "Please upload last month's light bill.");
  }
  let fields = null;
  if (bill) {
    try {
      fields = await readUploadedBill(admin, bill.bytes, bill.kind.type);
    } catch (e) {
      console.error("[booking:extract]", e instanceof Error ? e.name : "unknown");
      fields = null;
    }
  }
  const history = new Map((fields?.usageHistory ?? []).map((point) => [point.month, point.kwh]));
  const monthsEntered = /* @__PURE__ */ new Set();
  for (const [key, raw] of form.entries()) {
    if (!key.startsWith("usage-") || raw === "") continue;
    const month = key.slice(6);
    const kwh = typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
    monthsEntered.add(month);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(kwh) || kwh < 0 || kwh > 1e6 || monthsEntered.size > 12) {
      return fail(400, "invalid_usage", "Check the monthly kWh values.");
    }
    history.set(month, kwh);
  }
  const usageHistory = [...history].sort(([a], [b]) => a.localeCompare(b)).map(([month, kwh]) => ({ month, kwh }));
  const now = /* @__PURE__ */ new Date();
  try {
    const busy = await busyTime(admin, now);
    if (!isBookableSlot(startDate, now, busy)) {
      return fail(409, "slot_unavailable", "Sorry \u2014 that time was just taken or is no longer available. Please pick another.");
    }
  } catch (e) {
    console.error("[booking:recheck]", e);
    return fail(503, "calendar_unavailable", "We couldn't confirm that time right now. Please try again in a minute.");
  }
  const endDate = new Date(startDate.getTime() + DEFAULT_RULES.slotMinutes * 6e4);
  let billPath = null;
  if (bill) {
    const month = startDate.toISOString().slice(0, 7);
    billPath = `${month}/${crypto.randomUUID()}.${bill.kind.ext}`;
    const { error } = await admin.storage.from(BILL_BUCKET).upload(billPath, bill.bytes, { contentType: bill.kind.type, upsert: false });
    if (error) {
      console.error("[booking:upload]", error);
      return fail(500, "upload_failed", "We couldn't upload your light bill. Please try again.");
    }
  }
  const { data: appt, error: insertError } = await admin.from("hub_appointments").insert({
    starts_at: startDate.toISOString(),
    ends_at: endDate.toISOString(),
    source: "public",
    customer_name: name,
    phone,
    email,
    address,
    note: note || null,
    referral_rep: clean(form.get("ref"), 64).replace(/[^a-zA-Z0-9 _.-]/g, "") || null,
    referral_state: /^[A-Z]{2}$/.test(clean(form.get("state"), 8)) ? clean(form.get("state"), 8) : null,
    client_ip_hash: ipKey,
    kwh: fields?.kwhThisPeriod ?? null,
    bill_amount: billAmount(fields),
    esiid: fields?.esiid ?? null,
    meter_number: fields?.meterNumber ?? null,
    tdu: fields?.tdu ?? null,
    rep_puct_certificate: fields?.repPuctCertificate ?? null,
    avg_monthly_kwh: fields?.avgMonthlyKwh ?? null,
    usage_history: usageHistory.length ? usageHistory : null
  }).select("id, referral_rep, referral_state").single();
  if (insertError || !appt) {
    if (billPath) await admin.storage.from(BILL_BUCKET).remove([billPath]);
    if (insertError?.code === "23P01") {
      return fail(409, "slot_unavailable", "Sorry \u2014 that time was just taken. Please pick another.");
    }
    console.error("[booking:insert]", insertError);
    return fail(500, "save_failed", "We couldn't save your booking. Please try again.");
  }
  let meterStatus = null;
  if (meterResult.value) {
    const meter = meterResult.value;
    const { error } = await admin.from("smt_authorizations").insert({
      appointment_id: appt.id,
      esi_id: meter.esiId,
      meter_number: meter.meterNumber,
      customer_email: meter.email,
      consent_at: (/* @__PURE__ */ new Date()).toISOString(),
      consent_text: METER_CONSENT_TEXT,
      status: "pending_setup"
    });
    if (error) {
      console.error("[booking:meter]", error);
      meterStatus = "failed";
    } else {
      meterStatus = "pending_setup";
    }
  }
  if (bill && billPath) {
    const { error } = await admin.from("hub_appointment_files").insert({
      appointment_id: appt.id,
      kind: "light_bill",
      bucket: BILL_BUCKET,
      storage_path: billPath,
      original_name: bill.name,
      content_type: bill.kind.type,
      size_bytes: bill.bytes.byteLength
    });
    if (error) console.error("[booking:file-row]", error);
  }
  await syncHubAppointment(admin, {
    id: appt.id,
    starts_at: startDate.toISOString(),
    ends_at: endDate.toISOString(),
    source: "public",
    customer_name: name,
    phone,
    email,
    address,
    note: note || null,
    google_event_id: null
  }, { hasLightBill: !!bill });
  await notifyAppointment(admin, {
    id: appt.id,
    source: "booking",
    name,
    phone,
    email,
    address,
    kwh: fields?.kwhThisPeriod ?? null,
    amount: billAmount(fields),
    appointment: new Intl.DateTimeFormat("en-US", {
      timeZone: SLOT_TIME_ZONE,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    }).format(startDate),
    billAttached: !!bill,
    dashboardUrl: dashboardLeadUrl(siteOrigin(env("SITE_URL")), appt.id)
  }, startDate.toISOString());
  return json({
    ok: true,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    timeZone: SLOT_TIME_ZONE,
    referralRep: appt.referral_rep,
    referralState: appt.referral_state,
    meterStatus
  });
}
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  const admin = adminClient();
  if (!admin) return notConfigured(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  try {
    if (req.method === "GET") return await listSlots(admin);
    if (req.method === "POST") return await book(admin, req);
    return fail(405, "method_not_allowed", "Method not allowed.");
  } catch (e) {
    console.error("[booking]", e);
    return fail(500, "server_error", "Something went wrong. Please try again.");
  }
});
