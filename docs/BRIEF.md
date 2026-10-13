# HaloHaul — Build Prompt for Claude Code

You are building **HaloHaul**, a personal-buyer / group-buy service. University students in Malaysia submit items from Chinese marketplaces. The operator (one person, me) sources and buys them, consolidates them into scheduled shipping batches, and hands them out at a campus pickup point.

Build it in the phases below. **Stop at the end of each phase**, summarise what you built, list anything you were unsure about, and wait for my go-ahead before starting the next phase. Do not add features outside the current phase.

Design references are in `/design` (Figma exports: homepage, admin "Need Action" board, order detail, admin components). Figma file: https://www.figma.com/design/XPvUgIj59J6Rx9B1WpakVL/HaloHaul---Proxy-Buying-Service. Match the visual direction, but follow this document wherever the designs and this document disagree.

---

## 1. Brand

- The logo is styled **"Halō Haul"**. In all text, URLs, emails and handles, write **"HaloHaul"**.
- "Avela" was an old placeholder name. It must not appear anywhere. Some design frames still say "Avela", "Paid via Avela" or "Haulo price"; replace every one with HaloHaul.
- The design has a spelling mistake: "Consilidate". Always spell it "Consolidate".

## 2. Tech stack (decided — don't substitute without asking)

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router, TypeScript strict) — customer site, admin, and API in one app |
| Database | PostgreSQL 16 |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Validation | Zod (shared between client and server) |
| Forms | React Hook Form + Zod resolver |
| Auth | Better Auth (email magic link + password for students; admin role with 2FA) |
| UI | Tailwind CSS + shadcn/ui, Lucide icons |
| Tables | TanStack Table |
| Charts | Recharts |
| Background jobs | pg-boss (runs on Postgres, no Redis), executed by a separate worker process from the same codebase |
| Email | Resend + React Email |
| File storage | Cloudflare R2 via @aws-sdk/client-s3 (presigned uploads); compress images with sharp |
| PWA (admin on phone) | Serwist |
| Dates | date-fns, timezone Asia/Kuala_Lumpur |
| Tests | Vitest (unit), Playwright (end-to-end) |
| Reverse proxy | Caddy (automatic HTTPS) |
| Deploy | Docker Compose on a VPS; images built in GitHub Actions and pushed to GHCR |

## 3. Hosting constraints (important)

The trial runs on a **1 vCPU / 1 GB RAM / 10 GB disk Ubuntu 24.04 VPS**. Design for that:

- **Never build on the server.** Use Next.js `output: "standalone"` with a multi-stage Dockerfile, build in GitHub Actions, and have the server only pull and run images.
- `docker-compose.yml` services: `app`, `worker`, `postgres`, `caddy`. Set memory limits on each container.
- Postgres tuning: `shared_buffers=128MB`, `max_connections=20`, `work_mem=4MB`.
- Turn on Docker log rotation (json-file, max-size 10m, max-file 3).
- Provide a setup script that adds a 2 GB swap file.
- Never store photos on local disk; they all go to R2.
- Provide a nightly `pg_dump` backup job that uploads to a separate R2 bucket, keeps 14 days, and comes with a documented restore procedure.

## 4. Domain model

### 4.1 Money
- Store all money as **integers**: MYR in sen (`*_sen`), RMB in fen (`*_fen`). Never use floats for money.
- Every RMB amount is stored together with the exchange rate used at that moment (`fx_rate_myr_per_cny`, stored as a numeric string or a scaled integer).
- The ledger is **append-only**. Never update or delete ledger rows. Corrections are new entries.

### 4.2 Tables (initial)
Use Drizzle. Names are suggestions — keep them consistent.

- `users` / `sessions` / `accounts` — Better Auth managed. `role`: `student` | `admin`.
- `customer_profiles` — user_id, display_name, phone (WhatsApp), campus, `saved_measurements jsonb` (reused to prefill forms; validated per category).
- `orders`
  - id (human-readable sequence, shown as `#1222`), customer_id
  - `path_type`: `url` | `reverse_search` | `consultation` | `digital`
  - `platform`: `taobao` | `pdd` | `weidian` | `1688` | `xianyu` | `meituan` | `jd` | `dewu` | `rednote` | `douyin` | `other`
  - product_url (nullable), reference_photo_keys (text[])
  - `category` (key into the category registry), `category_schema_version` int
  - `details jsonb` — category-specific fields (validated by the registry, see 4.3)
  - variant_text (colour/option), quantity
  - `condition_preference` (nullable; required when there is no direct link)
  - `shipping_mode`: `air` | `air_sensitive` | `sea` | `pdd_direct` | `none` (digital)
  - `status` (see 4.4), batch_id (nullable)
  - estimated weight/dimensions, final (warehouse) weight/dimensions
  - tracking_number, tracking_note (free text shown to the student)
  - restricted_flag boolean, restricted_reason
  - remarks, created_at, updated_at
- `order_status_history` — append-only: order_id, from_status, to_status, actor_id, note, created_at.
- `sourcing_options` — order_id, title, url, price_fen, seller_note, photo_key, est_weight_g, est_dims, is_selected.
- `quotes` — order_id, item_price_fen, fx_rate, service_fee_sen, shipping_estimate_min_sen, shipping_estimate_max_sen, delivery_fee_sen, total_min_sen, total_max_sen, status (`sent` | `accepted` | `declined` | `expired`), expires_at.
- `batches` — code (e.g. `Air #12`), mode, cutoff_at, min_orders, status (`open` | `locked` | `consolidated` | `shipped` | `arrived` | `distributed`), actual_weight_g, actual_cost_fen, forwarder.
- `ledger_entries` — append-only: order_id, customer_id, type (`service_fee` | `item_payment` | `shipping_estimate` | `shipping_adjustment` | `refund` | `delivery_fee` | `consultation_fee` | `reverse_search_fee`), amount_sen (positive = owed by student, negative = credit), reference, created_by, created_at.
- `payments` — order_id, method (`duitnow_manual` | `fiuu`), amount_sen, proof_photo_key (manual), `provider_tran_id` (**UNIQUE**, nullable), status (`pending` | `confirmed` | `failed`), raw_payload jsonb, confirmed_by, created_at.
- `restricted_items` — keyword, applies_to_modes (text[]), forwarder (nullable), note.
- `showcase_products` — the homepage "What people bought recently" cards: title, variant, platform, shipping_mode, retail_price_sen, haulohaul_price_sen, photo_key, source_order_id (nullable), retail_checked_at, is_published.
- `settings` — single row of configurable values (see section 5).

### 4.3 Category registry (code-defined, versioned)
Every category asks for different details. Define them in `src/domain/categories/` as a typed registry: each entry has a Zod schema, field metadata for rendering (label, unit, input type, help text), default weight/dimensions, and a `version`.

The **same Zod schema** must validate the student's form in the browser, validate again on the server, and drive the dynamic form renderer. One generic `<CategoryFields>` component renders any category from its metadata.

Initial categories:

| Key | Required fields |
|---|---|
| `clothing_top` | chest_cm, shoulder_cm, arm_length_cm, body_length_cm |
| `clothing_bottom` | waist_cm, hip_cm, inseam_cm |
| `dress` | chest_cm, waist_cm, hip_cm, length_cm |
| `bra` | underbust_cm, overbust_cm |
| `shoes` | size, size_system (UK/US/EU/CN), foot_length_cm |
| `ring` | inner_circumference_mm |
| `glasses_prescription` | sph_left, sph_right, cyl_left, cyl_right, axis_left, axis_right, pd_mm |
| `contact_lens` | sph_left, sph_right, base_curve (optional), colour (in variant) |
| `cosmetics` | shade (in variant) |
| `electronics` | model, spec_notes, voltage/plug note |
| `digital` | region, delivery_email |
| `other` | description |

Rules:
- **Measurement categories reject the submission if any required measurement is missing.** The student sees an inline error naming the missing field, and everything they already entered is kept.
- Saved measurements from `customer_profiles` prefill the form, and the student can update them there.
- Store `category_schema_version` on each order so old orders still render after a schema changes.

### 4.4 Statuses
Use one enum and one transition map, `src/domain/orderStateMachine.ts`. Invalid transitions must be impossible, enforced on the server.

```
submitted → needs_info | sourcing | quote_sent | rejected
needs_info → submitted
sourcing → quote_sent | rejected
quote_sent → awaiting_payment | cancelled
awaiting_payment → paid | cancelled
paid → order_submitted               (bought from seller)
order_submitted → at_warehouse
at_warehouse → qc_review
qc_review → ready_to_consolidate | rejected (refund path)
ready_to_consolidate → consolidated   (assigned to a locked batch)
consolidated → shipped → arrived_my → ready_for_pickup → completed
any pre-payment state → cancelled
```

Flags that sit alongside the status: `shipping_balance_due` and `shipping_refund_due`, set by reconciliation.

**Every status change** writes to `order_status_history` and queues a notification job.

## 5. Business rules (all values configurable in `settings`)

**Fees**
- Coordination fee (url path): default RM6 per item.
- Reverse-search fee: RM4.
- Consultation fee: RM25.
- Consultation and reverse-search fees are kept if the student selects nothing. If the student goes ahead, the fee is credited toward the order.

**Shipping estimate**
- Billable weight = max(actual weight, L×W×H ÷ 6000).
- Prefer the seller-confirmed weight and dimensions. Fall back to the category default.
- Show the student a **range** (min–max), never a single number. The rate table is per forwarder and per mode: first kg + each additional kg, stored in settings.

**Reconciliation after warehouse weigh-in**
- Within the quoted range: nothing to do.
- Above the range: charge the difference, capped at +20% over the top of the range. You absorb anything beyond the cap.
- Below the range: credit the difference.
- **Nothing is released for pickup while a balance is owed.**

**Batches**
- Each mode has its own cutoff. The worker auto-locks a batch at its cutoff.
- If a batch is below `min_orders` at cutoff, alert the admin and offer two actions: extend 48 h, or roll orders into the next batch.
- Orders that miss a cutoff roll into the next batch automatically.

**Cancellation:** free until status `order_submitted`. After that, cancellation is not allowed through the UI.

**Restricted items:** keyword-match at submission. A match sets `restricted_flag` and holds the order for admin review before any quote goes out.

**PDD direct-ship:** these orders skip forwarder shipping. They pay item price plus the coordination fee only, aren't tied to a batch, and show "Delivery time set by PDD".

**Free-shipping listings (包邮)** cover only the domestic China leg. International shipping still applies; show this note on such orders.

**Pickup**
- The default is a fixed **campus pickup point**, shown as a time window.
- Optional Lalamove delivery: +RM3 per person.
- **Never show or store the operator's home address anywhere in the app.**

**Link validation**
- Accept only the supported platforms.
- A Rednote or Douyin link that points to a content post (not a product page) is routed to the `reverse_search` path, with a message to the student explaining why.

**Analytics capture:** for every order, record the shipping mode chosen, the category, and the price/speed difference shown at the moment of choosing. This feeds the "speed vs price" report.

## 6. Customer site

Visual direction: the celestial/garden photography with serif headlines from the homepage designs.

Pages:
1. **Home**
   - hero
   - "How would you like to start?" cards: You have a link / You have a photo / You want a digital product / You're not sure (consultation)
   - live cutoff countdown cards, read from the `batches` table
   - "The Process" in 4 steps
   - "What people bought recently", from `showcase_products`; each card's "Order for myself" button opens the order form prefilled with that product
   - "Built on transparency" section. Use this copy for the shipping item: "Your final shipping charge comes from the warehouse weigh-in. Any difference is settled before release."
2. **Start an order**: a multi-step form that adapts to the path type, the dynamic `<CategoryFields>`, photo upload to R2 via presigned URL, and the restricted-item check.
3. **Order tracking**: a status timeline, the quote breakdown (item, service fee, shipping range, all shown separately), the tracking note, and the balance owed or credited.
4. **Quote review**: shows the sourcing options (2–3 cards with links), accept or decline, and then payment instructions.
5. **Payment (trial)**: DuitNow QR plus a proof-of-payment upload. The admin confirms it.
6. Account: saved measurements, order history.
7. How it works, Shipping schedule, Terms (cancellation window, estimate caveat, secondhand condition disclaimer, restricted items, rejection reasons, PDPA privacy notice).

## 7. Admin (`/admin`, role `admin` only)

Visual direction: dark theme, glowing blue active nav item, pill filter chips (see `/design/Admin_component.png`).

Navigation:
- Actions
- Dashboard
- Batches
- Products
- Calendar
- Payment
- Customer
- Messages
- Report

**Actions ("Need Action")**
- Shows only orders that need my attention, **oldest first**, grouped by day.
- Filter chips: All · URL Submitted · Reverse Search · Consultation · Ready to Consolidate · Order Submitted · QC Review · Shipping Refund. The first three filter `path_type` among new submissions; the rest filter by status or flag.
- **Replace "Mark as Completed" with a single context-aware primary action** per card, driven by the state machine. For example: "Send quote", "Confirm payment", "Mark bought", "Approve QC", "Add to batch", "Ready for pickup".
- Each card shows: order number, product, customer, path tag, platform, **time waiting** (e.g. "waiting 2d"), and payment state.

**Order detail**
- customer and contact (with a `wa.me` link carrying a prefilled message)
- category details rendered from the registry
- product link and reference photos
- sourcing options editor
- quote builder with live shipping-estimate calculation
- payment and ledger panel
- status timeline
- tracking number and tracking note
- batch assignment
- restricted-item flag
- internal notes

**Batches**
- Create, edit and lock batches.
- Progress bar toward `min_orders`.
- Generate a consolidation summary (item list, total estimated weight) to place orders with sellers.
- Weigh-in entry, which triggers reconciliation for every order in the batch.

**Calendar:** a month view of cutoffs and pickup windows. Read-only, built from `batches`.

**Payment:** queue of manual payment proofs to confirm or reject. The ledger is viewable per order and per customer.

**Customer:** list and detail views, including order history and saved measurements.

**Products:** CRUD for showcase cards, with a publish toggle and the date the retail price was last checked.

**Messages (trial):** don't build chat. Show the list of customers with one-tap WhatsApp links and saved message templates (quote sent, payment received, ready for pickup).

**Report:**
- revenue and fees by batch
- orders by category and by path
- speed vs price chart
- average time spent in each status

**Mobile (most admin use is on a phone)**
- Bottom nav with Actions, Batches, Payment and Customer, plus "More".
- Single-column cards.
- The primary action is reachable with the thumb.
- Installable as a PWA.

## 8. Notifications
- The worker sends an email on each meaningful status change, using React Email templates with the HaloHaul branding.
- The admin gets a daily digest email: actions waiting, upcoming cutoffs, unconfirmed payments.
- WhatsApp is `wa.me` links only for now. Don't integrate the WhatsApp Business API.

## 9. Security and privacy
- Secrets come from env vars only. Commit `.env.example` and never `.env`.
- Students can only ever read their own orders, profiles and photos. Every query is scoped by the session user. Write tests for this.
- R2 objects are private. Serve them through short-lived presigned GET URLs.
- Validate file type and size on upload, and re-encode images with sharp, which also strips EXIF metadata.
- Rate-limit order submission, sign-in and upload endpoints.
- Admin requires 2FA.
- Store measurements, prescriptions and phone numbers as personal data. Include a PDPA-style privacy notice, and give students a way to delete their account and data.
- Caddy security headers: HSTS, CSP, frame-ancestors.

## 10. Fiuu (later phase — design for it now)
- `payments.provider_tran_id` is UNIQUE. The callback handler must be **idempotent**: insert with on-conflict-do-nothing inside a transaction, and only on the first insert of a status `00` write the ledger entry and change the order status.
- Verify `skey` with the secret key on every return and callback, and check the amount against the accepted quote.
- Status `22` (pending) is not paid.
- Add a nightly reconciliation job that compares Fiuu settlements with the ledger.

## 11. Phases

**Phase 1 — Foundation**
- Repo scaffold, Docker setup (Dockerfile, compose, Caddyfile), GitHub Actions build-and-deploy, swap and backup scripts.
- Drizzle schema and migrations, seed data, Better Auth with roles, the category registry with tests, the state machine with tests, and the money and shipping calculation utilities with tests.

**Phase 2 — Customer intake**
- Home page with live countdowns.
- Order form with dynamic category fields, uploads, link validation and routing, the restricted-item check.
- Order tracking page, account page with saved measurements.

**Phase 3 — Admin core**
- Admin layout (desktop and mobile).
- Actions board with context-aware actions, order detail, sourcing options, quote builder.
- Status transitions, history, email notifications.

**Phase 4 — Batches and money**
- Batches with worker auto-lock, consolidation summary, weigh-in and reconciliation.
- Ledger, manual DuitNow payment flow, Payment page.

**Phase 5 — Polish**
- Products/showcase, Calendar, Customer pages, Report, Messages templates, PWA, Playwright end-to-end tests covering the full order lifecycle.

**Phase 6 — Hardening and deploy**
- Security review checklist, backup-restore test, Uptime Kuma instructions, production deploy runbook in `docs/DEPLOY.md`.

**Out of scope for now:** Fiuu integration (schema-ready only), Flutter admin app, WhatsApp Business API, in-app chat, barcode scanning, multi-admin.

## 12. Working rules
- Put business logic in `src/domain/` as pure, tested functions: fees, shipping estimate, reconciliation, state machine, category registry. UI and route handlers call these functions and never reimplement them.
- Every money and state-machine function needs unit tests, including edge cases (rounding, the cap at +20%, a below-range credit, a duplicate payment callback).
- Use server actions or route handlers with Zod validation on every input.
- Keep dependencies lean; check memory impact before adding anything heavy.
- Make small, focused commits with clear messages.
- When something in this document conflicts with the designs, or seems wrong, ask me rather than guessing.
