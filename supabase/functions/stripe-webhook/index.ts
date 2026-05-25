import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.5";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

const PLAN_CREDITS: Record<string, number> = {
  starter: 100,
  pro: 250,
  max: 1000,
  oneshot: 10,
};

async function addCredits(
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
  email: string | null,
  credits: number,
  plan: string,
  stripeId: string
): Promise<boolean> {
  if (!userId && !email) {
    console.error("[stripe-webhook] no user_id or email", stripeId);
    return false;
  }

  let query = supabase
    .from("profiles")
    .select("id, credits, credited_stripe_sessions")
    .limit(1);

  if (userId) {
    query = query.eq("id", userId);
  } else {
    query = query.eq("email", email!);
  }

  const { data: profiles, error: selectError } = await query;

  if (selectError || !profiles || profiles.length === 0) {
    console.error("[stripe-webhook] user not found", {
      userId,
      email,
      selectError,
    });
    return false;
  }

  const profile = profiles[0];
  const creditedSessions: string[] = profile.credited_stripe_sessions || [];

  if (creditedSessions.includes(stripeId)) {
    console.log("[stripe-webhook] already credited, skipping", stripeId);
    return true;
  }

  const newCredits = (profile.credits ?? 0) + credits;
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      credits: newCredits,
      credited_stripe_sessions: [...creditedSessions, stripeId],
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (updateError) {
    console.error("[stripe-webhook] update error:", updateError);
    return false;
  }

  console.log(
    `[stripe-webhook] +${credits} credits to user ${profile.id} (plan: ${plan}). New total: ${newCredits}`
  );
  return true;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const body = await req.text();

  console.log("[stripe-webhook] Request received", {
    hasSignature: !!signature,
    hasSecret: !!webhookSecret,
  });

  let event: Stripe.Event;

  if (webhookSecret && signature) {
    try {
      // Use constructEventAsync with SubtleCryptoProvider (required in Deno)
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined,
        Stripe.createSubtleCryptoProvider()
      );
      console.log("[stripe-webhook] Signature verified");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[stripe-webhook] Signature verification failed:", msg);
      return new Response("Webhook signature verification failed", {
        status: 400,
      });
    }
  } else {
    console.warn("[stripe-webhook] No webhook secret, skipping verification");
    try {
      event = JSON.parse(body) as Stripe.Event;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
  }

  console.log("[stripe-webhook] Event type:", event.type);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[stripe-webhook] Missing Supabase configuration");
    return new Response("Server configuration error", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id ?? null;
      const email =
        session.customer_details?.email ??
        session.metadata?.user_email ??
        null;
      const plan = session.metadata?.plan ?? "starter";
      const credits =
        parseInt(session.metadata?.credits ?? "0", 10) ||
        PLAN_CREDITS[plan] ||
        0;

      console.log("[stripe-webhook] checkout.session.completed", {
        sessionId: session.id,
        userId,
        email,
        plan,
        credits,
      });

      if (credits) {
        await addCredits(supabase, userId, email, credits, plan, session.id);
      } else {
        console.error("[stripe-webhook] credits = 0, skipping");
      }
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;

      if (invoice.billing_reason !== "subscription_cycle") {
        console.log("[stripe-webhook] Skipping non-renewal invoice");
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const subscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : (invoice.subscription as any)?.id;

      if (!subscriptionId) {
        console.error("[stripe-webhook] No subscription ID");
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata?.user_id ?? null;
      const email = invoice.customer_email ?? null;
      const plan = subscription.metadata?.plan ?? "starter";
      const credits =
        parseInt(subscription.metadata?.credits ?? "0", 10) ||
        PLAN_CREDITS[plan] ||
        0;

      console.log("[stripe-webhook] invoice.payment_succeeded", {
        invoiceId: invoice.id,
        subscriptionId,
        userId,
        email,
        plan,
        credits,
      });

      if (credits) {
        await addCredits(supabase, userId, email, credits, plan, invoice.id);
      }
    }
  } catch (error) {
    console.error("[stripe-webhook] Error processing event:", error);
    return new Response("Internal server error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
