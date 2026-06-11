# Google Ads — Mold Expert Reports

## Budget recommendation
**$300-$600 for first 14 days.** At Indiana CPCs of $4-$12 for mold keywords, that's 30-100 clicks. At 3-6% landing-page conversion, expect 1-6 paid bookings = $497-$11,982 revenue.

## Campaign setup

**Campaign type:** Search (not Performance Max — too uncontrolled at this budget)
**Conversion goal:** Stripe purchase event (or as proxy: clicks on "Book" buttons → set up event in GA4)
**Geo:** Indiana — bid-boost +30% on Allen County, Marion County, Hamilton County
**Devices:** Mobile +0%, Desktop +20% (longer sessions convert better)
**Schedule:** 7am–10pm local, all days

## Keyword groups

### Ad Group 1 — High-intent buyer (priority)

Keywords (phrase match):
- "mold inspection cost"
- "mold inspection indianapolis"
- "mold inspection fort wayne"
- "mold remediation cost"
- "is mold remediation worth the cost"
- "second opinion mold"
- "independent mold inspector"
- "mold inspector vs remediation"

Negative keywords (always exclude):
- free, diy, kit, test kit, jobs, salary, training, certification, near me cheap, lawsuit attorney

### Ad Group 2 — Quote shoppers (warm)

- "mold removal cost"
- "average cost mold remediation"
- "mold quote"
- "how much does mold cost"
- "cheap mold remediation"

### Ad Group 3 — Insurance / dispute

- "mold insurance claim"
- "homeowners insurance mold coverage"
- "carrier denied mold claim"
- "mold expert witness indiana"

## Ad copy — 3 variants per ad group

### Variant A (cost-savings angle)
- Headline 1: Don't Overpay For Mold Removal
- Headline 2: Independent Expert Report - $497
- Headline 3: Force Apples-to-Apples Bids
- Description 1: Homeowners typically save $3,000-$10,000 by getting an independent protocol BEFORE calling remediation contractors.
- Description 2: Licensed Indiana inspector. 48-hour turnaround. Money-back guarantee.

### Variant B (insurance angle)
- Headline 1: Mold Claim Denied? Get The Right Report
- Headline 2: Insurance-Ready Mold Protocol
- Headline 3: IICRC S520 Compliant
- Description 1: Court-defensible expert mold reports written for insurance adjusters. Used in Indiana property-damage claims.
- Description 2: $497 Triage / $997 Standard / $1,997 On-Site. 48-hour turnaround.

### Variant C (second-opinion angle)
- Headline 1: Second Opinion On Your Mold Quote
- Headline 2: Independent Expert. Vendor-Neutral.
- Headline 3: 48-Hour Written Report
- Description 1: Got a $15,000 mold quote? Get an independent expert protocol first - typically saves homeowners thousands.
- Description 2: Indiana-licensed inspector. Remote consult available statewide.

## Landing page

All ads → `monitormyair.com/expert` (or `expert.monitormyair.com` if you set up the subdomain). Do NOT send to monitormyair.com homepage — kills conversion by 60-80%.

## Conversion tracking

Add this snippet to the landing page just before `</body>`:

```html
<script>
document.querySelectorAll('a[href*="stripe.com"], a[href*="buy.stripe"]').forEach(a => {
  a.addEventListener('click', () => {
    if (typeof gtag === 'function') {
      gtag('event', 'begin_checkout', { value: parseFloat(a.dataset.value || 0), currency: 'USD' });
    }
  });
});
</script>
```

And set up GA4 conversion event "begin_checkout" → import to Google Ads as conversion action.

## Daily monitoring

| Day | Action |
|---|---|
| 1 | Launch with $30/day budget |
| 3 | Pause any ad with <0.8% CTR. Add negative keywords from search-terms report. |
| 7 | Pause keywords with >$15 CPC and 0 conversions. Increase bid on top-converters. |
| 14 | Decide: scale to $50-$100/day if ROAS >2x, or pause and shift budget to organic. |

## Optimistic-case math

- $600 spent over 14 days
- ~60 clicks at $10 avg CPC
- 4 conversions at 6.5% landing CR
- 4 × $997 avg ticket = $3,988 revenue
- ROAS: **6.6x ad spend, before back-end contractor commission**

## Pessimistic-case math

- $600 spent, 50 clicks, 1 conversion
- $497 revenue, ROAS 0.8x → pause Google Ads, shift to organic content + attorney outreach
