// Supabase Edge Function: stripe-webhook
// Receives Stripe events and keeps the subscriptions table in sync.
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY         — your Stripe secret key
//   STRIPE_WEBHOOK_SECRET     — webhook signing secret (from Stripe Dashboard → Webhooks)
//
// Register in Stripe Dashboard → Developers → Webhooks:
//   Endpoint URL: https://<your-project>.supabase.co/functions/v1/stripe-webhook
//   Events to listen to:
//     - checkout.session.completed
//     - customer.subscription.updated
//     - customer.subscription.deleted

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'npm:stripe@14';

const PLAN_MAP: Record<string, string> = {
  'price_1T7f8CFAY0SgGV6JuTDa4ZZl': 'pro',
  'price_1T7f8RFAY0SgGV6JzfQSGvaP': 'studio',
};

const SEATS_MAP: Record<string, number> = {
  free: 1,
  pro: 5,
  studio: 999,
};

serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') break;

      const orgId = session.metadata?.org_id;
      if (!orgId) break;

      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
      const priceId = subscription.items.data[0]?.price.id;
      const plan = PLAN_MAP[priceId] ?? 'pro';

      await supabase.from('subscriptions').upsert({
        org_id: parseInt(orgId),
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: subscription.id,
        plan,
        status: subscription.status,
        seats: SEATS_MAP[plan] ?? 5,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' });

      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.org_id;
      if (!orgId) break;

      const priceId = subscription.items.data[0]?.price.id;
      const plan = PLAN_MAP[priceId] ?? 'pro';

      await supabase.from('subscriptions').upsert({
        org_id: parseInt(orgId),
        stripe_subscription_id: subscription.id,
        plan,
        status: subscription.status,
        seats: SEATS_MAP[plan] ?? 5,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' });

      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.org_id;
      if (!orgId) break;

      await supabase.from('subscriptions').upsert({
        org_id: parseInt(orgId),
        plan: 'free',
        status: 'canceled',
        seats: 1,
        stripe_subscription_id: null,
        current_period_end: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id' });

      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
