# Step 4 — Stripe Setup + Landing Page (90 minutes total)

## Use the MonitorMyAir Stripe account
Email on file: `caerospace.info@gmail.com`

Already onboarded, payouts already configured to your bank. **Don't create a new Stripe account.** Reuse this one — keeps all MonitorMyAir revenue in one ledger, which matters for the eventual acquisition story.

## Step A — Create 3 products in Stripe (20 min)

Log into Stripe → Products → **+ Add product** — repeat 3 times:

### Product 1: Triage Report
- Name: `Mold Triage Report`
- Description: `30-minute video consult + 48-hour written triage report. Most-likely moisture source, risk classification, recommended next steps, and intro to vetted remediation contractors if needed.`
- Price: `$497.00` — one-time
- Tax behavior: Inclusive (Indiana, verify your tax setup)
- Click **Save** → click **Create payment link** → copy URL

### Product 2: Standard Protocol Report
- Name: `Mold Remediation Protocol — Standard`
- Description: `Everything in the Triage Report PLUS a full 8-12 page Remediation Protocol with detailed scope of work. Hand this to any contractor as the bid spec. Apples-to-apples bidding typically saves homeowners $3,000-$10,000 on remediation costs. Insurance-claim-ready format. One 30-minute follow-up call included.`
- Price: `$997.00` — one-time
- Click **Save** → **Create payment link** → copy URL

### Product 3: Full On-Site Assessment
- Name: `Mold Remediation Protocol — Full On-Site`
- Description: `Everything in the Standard Protocol PLUS an on-site visit within Allen County + 60 miles. Moisture meter readings, IR thermal imaging, sampling if warranted, 15-25 annotated photos. Post-remediation clearance inspection included ($497 value).`
- Price: `$1,997.00` — one-time
- Click **Save** → **Create payment link** → copy URL

### Optional add-ons (create now to save time later)
- `Insurance Claim Letter — $297`
- `Contractor Bid Review — $197`
- `Post-Remediation Clearance Inspection — $497`
- `Annual Mold Check Subscription — $29/mo recurring`

## Step B — Landing page

I've built a single-file landing page at [`landing-page.html`](./landing-page.html) (in this folder).

**To deploy:**

### Option 1 — Cloudflare Pages (free, 10 min, recommended)
1. Go to dash.cloudflare.com → Workers & Pages → Create application → Pages → **Upload assets**
2. Drag the `landing-page.html` file (rename to `index.html` first)
3. Project name: `monitormyair-expert`
4. Click Deploy
5. Live at `https://monitormyair-expert.pages.dev` in ~30 seconds
6. Add custom domain if you want (e.g., `expert.monitormyair.com`) → Cloudflare → DNS

### Option 2 — Add to existing MonitorMyAir Shopify
- Shopify admin → Online Store → Pages → Add page
- Title: `Expert Mold Reports`
- Paste the HTML content into the source-code view
- Set URL handle: `/pages/expert-reports`
- Save → live at `monitormyair.com/pages/expert-reports`

### Replace the 3 Stripe link placeholders in the HTML
Open `landing-page.html`, find these strings, replace with the URLs from Step A:
- `STRIPE_LINK_TIER1` → Triage Report payment link
- `STRIPE_LINK_TIER2` → Standard Protocol payment link
- `STRIPE_LINK_TIER3` → Full On-Site payment link

## Step C — Auto-confirm email (10 min)

In Stripe → Settings → Emails → Customer emails → **enable receipts**. 

Then add a **post-purchase email** that gives the customer their next step:

```
Subject: Your Mold Report is Booked — Next Steps

Hi [Customer name] —

Thanks for booking. Here's what happens next:

1. You'll get a separate email within 1 hour with a Calendly link to 
   book your 30-min consult call (typical scheduling: next business day).
2. Before the call, please send 3-6 photos of the area to alex@monitormyair.com 
   with subject line "PHOTOS — [your name]".
3. After our call, your written report is delivered within 48 hours.

Questions before then: reply to this email or text [your number].

— Alex
MonitorMyAir
```

You can hand-send these for the first 5 customers; automate later with Zapier/Make once volume justifies.

## Step D — Calendly (5 min)

- Sign up free at calendly.com (link Google Calendar → calendar at alex@monitormyair.com)
- Create event: `MonitorMyAir Mold Consult — 30 min`
- Availability: weekdays 9a-6p, 30-min slots, 15-min buffer
- After booking, redirect to a thank-you page that says: "We'll see you on the call. Photos to alex@monitormyair.com before then."

## Done. Total time: ~90 min.

You now have a fully operational $497-$1,997 paid intake business sitting on top of the MonitorMyAir brand, payments live, scheduling live, ready to receive leads from Step 3.

Total upfront cost: **$0** (or up to $600 if you fund Google Ads).
