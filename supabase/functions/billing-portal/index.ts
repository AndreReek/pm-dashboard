// Supabase Edge Function: billing-portal
// Creates a Stripe Billing Portal session so users can manage their subscription.
// Called from dashboard.html "Manage Billing" button.
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY — your Stripe secret key
//   SITE_URL          — your Vercel URL

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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) throw new Error('Unauthorized');

    const { data: membership } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    if (!membership) throw new Error('No organization found');

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('org_id', membership.org_id)
      .single();

    if (!sub?.stripe_customer_id) throw new Error('No billing account found. Upgrade first.');

    const siteUrl = Deno.env.get('SITE_URL') ?? 'http://localhost:3000';

    // Create an inline portal configuration so no dashboard setup is required
    const configuration = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: 'Manage your PM Dashboard subscription',
        privacy_policy_url: `${siteUrl}/legal.html`,
        terms_of_service_url: `${siteUrl}/legal.html`,
      },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true },
        subscription_update: { enabled: false },
      },
    });

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${siteUrl}/dashboard.html`,
      configuration: configuration.id,
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
