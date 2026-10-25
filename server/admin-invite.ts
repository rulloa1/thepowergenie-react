import { supabaseConfig, supabaseFetch } from './supabase.js'
import { sendCustomEmail, sendCustomSms } from './notify.js'

export async function inviteDashboardMember(input: {
  email: string
  phone?: string
  name: string
  temporaryPassword?: string
  role?: 'admin' | 'owner'
}): Promise<{ ok: boolean; message: string; emailSent: boolean; smsSent: boolean }> {
  const email = input.email.trim().toLowerCase()
  const role = input.role || 'admin'
  const name = input.name.trim() || 'Team Member'
  const password = input.temporaryPassword || 'Genie#Solar9482!'
  const phone = input.phone?.trim()

  // 1. Ensure allowlist has entry
  try {
    const { url, key } = supabaseConfig()
    await supabaseFetch('/rest/v1/hub_allowlist', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([{ email, role, full_name: name }]),
    })

    // 2. Ensure user exists in auth.users via Supabase Admin API
    const userRes = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      }),
    })

    if (userRes.status === 422) {
      // User exists: update password
      const listRes = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=100`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
      })
      if (listRes.ok) {
        const listData = (await listRes.json()) as { users?: Array<{ id: string; email: string }> }
        const existing = listData.users?.find((u) => u.email?.toLowerCase() === email)
        if (existing?.id) {
          await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
            method: 'PUT',
            headers: {
              apikey: key,
              authorization: `Bearer ${key}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ password, email_confirm: true }),
          })
        }
      }
    }
  } catch (err) {
    console.error('Supabase user creation failed:', err)
  }

  // 3. Send Email notification
  const emailSubject = 'Your Power Genie Referral Hub Access & Login Info'
  const emailBody = `Hi ${name},

You have been granted access to The Power Genie Referral Hub dashboard.

Here is your login info:
• Dashboard: https://thepowergenie.theroyeffect.com/dashboard
• Login Email: ${email}
• Temporary Password: ${password}

Please log in to review customer leads, appointments, and smart meter historical electric data.

Welcome aboard!
The Power Genie Team`

  const emailSent = await sendCustomEmail(email, emailSubject, emailBody)

  // 4. Send SMS notification
  let smsSent = false
  if (phone) {
    const cleanPhone = phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`
    const smsBody = `Power Genie: Hi ${name}, your dashboard login is ready!
URL: https://thepowergenie.theroyeffect.com/dashboard
Email: ${email}
Temp Password: ${password}`
    smsSent = await sendCustomSms(cleanPhone, smsBody)
  }

  return {
    ok: true,
    message: `Invite processed. Email sent: ${emailSent}, SMS sent: ${smsSent}`,
    emailSent,
    smsSent,
  }
}
