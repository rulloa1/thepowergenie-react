-- Automated Follow-Up Sequences
-- Sends email + SMS nurture messages after appointment completion

-- Sequence state per lead
CREATE TABLE IF NOT EXISTS hub_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES powergenie_customers(id) ON DELETE CASCADE,

  -- Sequence state
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'completed', 'unsubscribed')),
  current_step int NOT NULL DEFAULT 0,
  next_send_at timestamptz,

  -- Proposal tracking
  proposal_path text,           -- Supabase Storage path
  proposal_viewed_at timestamptz,

  -- Unsubscribe handling
  unsubscribe_token uuid DEFAULT gen_random_uuid(),
  unsubscribed_at timestamptz,
  unsubscribe_reason text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,

  UNIQUE(lead_id)
);

-- Message audit log
CREATE TABLE IF NOT EXISTS hub_sequence_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES hub_sequences(id) ON DELETE CASCADE,
  step int NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),

  -- Delivery tracking
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered boolean,
  opened_at timestamptz,
  clicked_at timestamptz,

  -- Content snapshot
  subject text,
  body_preview text
);

-- Editable message templates
CREATE TABLE IF NOT EXISTS hub_sequence_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step int NOT NULL UNIQUE,
  delay_hours int NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'both')),

  -- Templates with {{name}}, {{savings}}, {{address}}, {{unsubscribe_url}} placeholders
  email_subject text,
  email_body text,
  sms_body text,

  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for cron efficiency
CREATE INDEX IF NOT EXISTS idx_sequences_pending
  ON hub_sequences(next_send_at)
  WHERE status = 'active' AND next_send_at IS NOT NULL;

-- Index for unsubscribe lookups
CREATE INDEX IF NOT EXISTS idx_sequences_unsubscribe_token
  ON hub_sequences(unsubscribe_token);

-- RLS policies
ALTER TABLE hub_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_sequence_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE hub_sequence_templates ENABLE ROW LEVEL SECURITY;

-- Hub members can view sequences
CREATE POLICY hub_sequences_select ON hub_sequences
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM hub_profiles WHERE id = auth.uid()));

-- Hub members can view messages
CREATE POLICY hub_sequence_messages_select ON hub_sequence_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM hub_profiles WHERE id = auth.uid()));

-- Hub members can view and edit templates
CREATE POLICY hub_sequence_templates_select ON hub_sequence_templates
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM hub_profiles WHERE id = auth.uid()));

CREATE POLICY hub_sequence_templates_update ON hub_sequence_templates
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM hub_profiles WHERE id = auth.uid() AND role = 'owner'));

-- Service role can do everything (for cron and API)
CREATE POLICY hub_sequences_service ON hub_sequences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY hub_sequence_messages_service ON hub_sequence_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY hub_sequence_templates_service ON hub_sequence_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed default templates
INSERT INTO hub_sequence_templates (step, delay_hours, channel, email_subject, email_body, sms_body) VALUES
(0, 1, 'email',
  'Your Solar Savings Summary — {{name}}',
  E'Hi {{name}},\n\nThank you for speaking with me today! Based on your {{kwh}} kWh usage, here''s what solar could save you:\n\n💰 Estimated Monthly Savings: ${{savings}}\n🏠 Address: {{address}}\n\nI''ve attached a detailed proposal for your review. Feel free to reply to this email or call me directly at 510-241-7007.\n\nLooking forward to helping you go solar!\n\n— Horace Lawrence\nSunrun Solar Expert\n\nUnsubscribe: {{unsubscribe_url}}',
  NULL),
(1, 48, 'sms',
  NULL, NULL,
  'Hi {{name}}, this is Horace from Sunrun. Quick question — did you get a chance to review your solar savings estimate? Happy to answer any questions. Reply or call 510-241-7007'),
(2, 120, 'email',
  '3 Things Texas Homeowners Forget About Solar',
  E'Hi {{name}},\n\n1️⃣ The federal tax credit (30%) won''t last forever\n2️⃣ Texas utility rates are rising faster than inflation\n3️⃣ Battery backup keeps your AC running during outages\n\nYour estimated savings: ${{savings}}/month\n\nReady to lock in your rate? Reply to schedule a follow-up call.\n\n— Horace\n\nUnsubscribe: {{unsubscribe_url}}',
  NULL),
(3, 168, 'sms',
  NULL, NULL,
  'Hey {{name}}, last chance to lock in current rates before the next utility increase. Your solar estimate: ${{savings}}/mo savings. Questions? 510-241-7007 — Horace'),
(4, 336, 'email',
  'Still thinking about solar, {{name}}?',
  E'Hi {{name}},\n\nI wanted to check in one more time. Solar is a big decision, and I''m here whenever you''re ready.\n\nYour personalized estimate:\n• Monthly savings: ${{savings}}\n• Address: {{address}}\n\nBook a call whenever it works for you: https://thepowergenie.theroyeffect.com/book\n\nNo pressure — just here to help.\n\n— Horace Lawrence\n510-241-7007\n\nUnsubscribe: {{unsubscribe_url}}',
  NULL)
ON CONFLICT (step) DO NOTHING;
