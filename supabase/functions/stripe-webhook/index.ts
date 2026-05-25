import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.5";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

interface StripeEvent {
  type: string;
  data: {
    object: {
      id: string;
      metadata?: Record<string, string>;
      subscription?: string;
      customer_email?: string;
      customer_details?: {
        email?: string;
      };
    };
  };
}

interface SupabaseProfile {
  id: string;
  email: string;
  credits: number;
  credited_stripe_sessions: string[];
}

const PLAN_CREDITS: Record<string, number> = {
  starter: 100,
  pro: 250,
  max: 1000,
  oneshot: 10,
};

async function addCreditsToUser(
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
  email: string | null,
  credits: number,
  plan: string,
  stripeId: string,
  eventType: string
): Promise<boolean> {
  console.log("[stripe-webhook] Adding credits:", {
    userId,
    email,
    credits,
    plan,
    stripeId,
    eventType,
  });

  if (!userId && !email) {
    console.error("[stripe-webhook] No user_id or email provided");
    return false;
  }

  try {
    // Find user by id or email
    let query = supabase.from("profiles").select("id, credits, credited_stripe_sessions").limit(1);

    if (userId) {
      query = query.eq("id", userId);
    } else if (email) {
      query = query.eq("email", email);
    }

    const { data: profiles, error: selectError } = await query;

    if (selectError) {
      console.error("[stripe-webhook] Error selecting profile:", selectError);
      return false;
    }

    if (!profiles || profiles.length === 0) {
      console.error("[stripe-webhook] Profile not found", { userId, email });
      return false;
    }

    const profile = profiles[0] as SupabaseProfile;
    const creditedSessions = profile.credited_stripe_sessions || [];

    // Check if already credited to avoid duplicates
    if (creditedSessions.includes(stripeId)) {
      console.log("[stripe-webhook] Session already credited, skipping", {
        stripeId,
        eventType,
      });
      return true;
    }

    const newCredits = (profile.credits || 0) + credits;
    const newSessions = [...creditedSessions, stripeId];

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        credits: newCredits,
        credited_stripe_sessions: newSessions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id);

    if (updateError) {
      console.error("[stripe-webhook] Error updating profile:", updateError);
      return false;
    }

    console.log("[stripe-webhook] Credits added successfully", {
      userId: profile.id,
      plan,
      credits,
      newTotal: newCredits,
      eventType,
      stripeId,
    });

    return true;
  } catch (error) {
    console.error("[stripe-webhook] Unexpected error:", error);
    return false;
  }
}

async function handleCheckoutSessionCompleted(
  supabase: ReturnType<typeof createClient>,
  event: StripeEvent
): Promise<void> {
  const session = event.data.object as any;

  console.log("[stripe-webhook] Processing checkout.session.completed", {
    sessionId: session.id,
    customerId: session.customer,
    customerEmail: session.customer_details?.email,
    metadata: session.metadata,
  });

  const userId = session.metadata?.user_id || null;
  const email = session.customer_details?.email || session.metadata?.user_email || null;
  const plan = session.metadata?.plan || "starter";
  const credits =
    parseInt(session.metadata?.credits || "0", 10) || PLAN_CREDITS[plan] || 0;

  if (!credits) {
    console.warn("[stripe-webhook] No credits to add for checkout session", {
      sessionId: session.id,
      plan,
    });
    return;
  }

  await addCreditsToUser(
    supabase,
    userId,
    email,
    credits,
    plan,
    session.id,
    "checkout.session.completed"
  );
}

async function handleInvoicePaymentSucceeded(
  supabase: ReturnType<typeof createClient>,
  event: StripeEvent
): Promise<void> {
  const invoice = event.data.object as any;

  console.log("[stripe-webhook] Processing invoice.payment_succeeded", {
    invoiceId: invoice.id,
    billingReason: invoice.billing_reason,
    subscriptionId: invoice.subscription,
    customerEmail: invoice.customer_email,
  });

  // Only handle subscription renewals, not initial invoices
  if (invoice.billing_reason !== "subscription_cycle") {
    console.log("[stripe-webhook] Skipping non-renewal invoice", {
      invoiceId: invoice.id,
      billingReason: invoice.billing_reason,
    });
    return;
  }

  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!subscriptionId) {
    console.error("[stripe-webhook] No subscription ID found");
    return;
  }

  try {
    // Retrieve subscription to get metadata
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const userId = subscription.metadata?.user_id || null;
    const email = invoice.customer_email || null;
    const plan = subscription.metadata?.plan || "starter";
    const credits =
      parseInt(subscription.metadata?.credits || "0", 10) ||
      PLAN_CREDITS[plan] ||
      0;

    if (!credits) {
      console.warn("[stripe-webhook] No credits for subscription renewal", {
        subscriptionId,
        plan,
      });
      return;
    }

    await addCreditsToUser(
      supabase,
      userId,
      email,
      credits,
      plan,
      invoice.id,
      "invoice.payment_succeeded"
    );
  } catch (error) {
    console.error("[stripe-webhook] Error processing invoice payment:", error);
  }
}

async function handleCustomerSubscriptionUpdated(
  supabase: ReturnType<typeof createClient>,
  event: StripeEvent
): Promise<void> {
  const subscription = event.data.object as any;
  const previousAttributes = (event as any).data.previous_attributes || {};

  console.log("[stripe-webhook] Processing customer.subscription.updated", {
    subscriptionId: subscription.id,
    status: subscription.status,
    previousStatus: previousAttributes.status,
    customerId: subscription.customer,
    metadata: subscription.metadata,
  });

  // Only credit if status changed to active (new subscription)
  if (
    previousAttributes.status === "incomplete" &&
    subscription.status === "active"
  ) {
    console.log("[stripe-webhook] Subscription became active, adding credits", {
      subscriptionId: subscription.id,
    });

    try {
      // Get customer details
      const customer = await stripe.customers.retrieve(
        subscription.customer as string
      );

      const userId = subscription.metadata?.user_id || null;
      const email = (customer as any).email || null;
      const plan = subscription.metadata?.plan || "starter";
      const credits =
        parseInt(subscription.metadata?.credits || "0", 10) ||
        PLAN_CREDITS[plan] ||
        0;

      if (!credits) {
        console.warn("[stripe-webhook] No credits for subscription activation", {
          subscriptionId: subscription.id,
          plan,
        });
        return;
      }

      await addCreditsToUser(
        supabase,
        userId,
        email,
        credits,
        plan,
        subscription.id,
        "customer.subscription.updated"
      );
    } catch (error) {
      console.error(
        "[stripe-webhook] Error processing subscription update:",
        error
      );
    }
  } else {
    console.log("[stripe-webhook] Subscription update not eligible for credits", {
      subscriptionId: subscription.id,
      statusChange: `${previousAttributes.status} -> ${subscription.status}`,
    });
  }
}

Deno.serve(async (req) => {
  // Only accept POST requests
  if (req.method !== "POST") {
    console.log("[stripe-webhook] Non-POST request received:", req.method);
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  console.log("[stripe-webhook] Request received", {
    hasSignature: !!signature,
    hasSecret: !!webhookSecret,
  });

  let event: StripeEvent;

  try {
    const body = await req.text();

    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(
          body,
          signature,
          webhookSecret
        ) as StripeEvent;
        console.log("[stripe-webhook] Signature verified");
      } catch (err: any) {
        console.error("[stripe-webhook] Signature verification failed:", err.message);
        return new Response("Webhook signature verification failed", {
          status: 400,
        });
      }
    } else {
      console.warn(
        "[stripe-webhook] No webhook secret configured, skipping verification"
      );
      event = JSON.parse(body) as StripeEvent;
    }
  } catch (error) {
    console.error("[stripe-webhook] Error parsing webhook:", error);
    return new Response("Invalid request body", { status: 400 });
  }

  console.log("[stripe-webhook] Event type:", event.type);

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[stripe-webhook] Missing Supabase configuration");
    return new Response("Server configuration error", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(supabase, event);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(supabase, event);
        break;

      case "customer.subscription.updated":
        await handleCustomerSubscriptionUpdated(supabase, event);
        break;

      default:
        console.log("[stripe-webhook] Unhandled event type:", event.type);
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
