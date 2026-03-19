// Supabase Edge Function: create-org
// Handles server-side org bootstrap during signup using service_role to bypass RLS.
// Called from login.html after a successful auth.signUp when a session is present.
//
// Required Supabase secrets (automatically injected in hosted Edge Functions):
//   SUPABASE_URL              — your Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY — service role key (never expose client-side)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default settings cloned for every new org — mirrors DEFAULT_SETTINGS in login.html.
const DEFAULT_SETTINGS = [
  { key: 'tecnologie', value: ["AMR", "AGV", "Automated Wrapper", "Software", "Conveyor", "Vision System"] },
  { key: 'brand', value: ["Agilox", "Kivnon", "Omron", "Otto", "Pieri", "Login Automation"] },
  { key: 'stati_fornitura', value: ["Undefined", "Ordered", "In Stock", "Staged", "FAT Done", "Shipped", "Delivered"] },
  { key: 'workflow_steps', value: ["1.0 Receipt of PO", "2.0 Internal Start-up", "3.0 Masterplan Update", "4.0 Project update in SAP", "5.0 Document Registration", "6.0 Internal Kick-off", "7.0 External Kick-off", "8.0 Email Recap After Meeting", "9.0 Documentation Sending", "10.0 FAT", "11.0 Project Charter Creation", "12.0 Share with Commissioning", "13.0 Pre-commissioning Meeting", "14.0 Commissioning & SAT", "15.0 Final Repository Update", "16.0 Handover to Service", "17.0 Project Closing", "18.0 Internal Retrospective", "19.0 Follow-up KA Meeting"] },
  { key: 'categorie', value: ["executive", "trial", "non-project"] },
  { key: 'priorita', value: ["high", "medium", "low"] },
];

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify the calling user via their JWT (same pattern as create-checkout)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');
    const token = authHeader.replace('Bearer ', '');

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    );

    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !user) throw new Error('Unauthorized');

    // Parse request body
    const { orgName } = await req.json();
    if (!orgName || typeof orgName !== 'string' || orgName.trim().length === 0) {
      throw new Error('orgName is required');
    }

    // Service role client — bypasses RLS for all writes below
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Create organization
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert([{ name: orgName.trim() }])
      .select()
      .single();
    if (orgError) throw new Error(`Failed to create organization: ${orgError.message}`);

    // 2. Link user to org as admin
    const { error: memberError } = await supabaseAdmin
      .from('org_members')
      .insert([{ user_id: user.id, org_id: org.id, role: 'admin' }]);
    if (memberError) throw new Error(`Failed to create org membership: ${memberError.message}`);

    // Subscription row is created automatically by the DB trigger create_trial_subscription

    // 3. Clone default settings for this org
    const settingsRows = DEFAULT_SETTINGS.map((s) => ({ ...s, org_id: org.id }));
    const { error: settingsError } = await supabaseAdmin
      .from('Settings')
      .insert(settingsRows);
    if (settingsError) throw new Error(`Failed to create default settings: ${settingsError.message}`);

    return new Response(
      JSON.stringify({ org: { id: org.id, name: org.name } }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
