// Supabase Edge Function: create-checkout
// Creates a Stripe Checkout session for plan upgrades.
// Called from dashboard.html when user clicks "Upgrade".
//
// Required Supabase secrets (set via: supabase secrets set KEY=value):
//   STRIPE_SECRET_KEY     — your Stripe secret key (sk_live_... or sk_test_...)
//   STRIPE_PRO_PRICE_ID   — Stripe Price ID for the Pro plan  (price_...)
//   STRIPE_STUDIO_PRICE_ID — Stripe Price ID for the Studio plan (price_...)
//   SITE_URL              — your Vercel URL, e.g. https://pm-dashboard-fawn.vercel.app

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });

    // Authenticate the calling user via their JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) throw new Error('Unauthorized');

    // Get the org_id for this user
    const { data: membership } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    if (!membership) throw new Error('No organization found');

    const { plan, priceId: explicitPriceId } = await req.json(); // 'pro' | 'studio', optional priceId override
    const priceId = explicitPriceId ?? (plan === 'studio'
      ? Deno.env.get('STRIPE_STUDIO_PRICE_ID')
      : Deno.env.get('STRIPE_PRO_PRICE_ID'));
    if (!priceId) throw new Error(`Price ID not configured for plan: ${plan}`);

    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:3000';

    // Check if this org already has a Stripe customer
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('org_id', membership.org_id)
      .single();

    let customerId = sub?.stripe_customer_id;

    // Create Stripe customer if first time
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { org_id: String(membership.org_id), user_id: user.id },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/dashboard.html?upgrade=success`,
      cancel_url: `${siteUrl}/dashboard.html?upgrade=cancel`,
      metadata: { org_id: String(membership.org_id) },
      subscription_data: {
        metadata: { org_id: String(membership.org_id) },
      },
      allow_promotion_codes: true,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
