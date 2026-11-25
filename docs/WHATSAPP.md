# Connecting WhatsApp

Admin → Messages becomes a real WhatsApp inbox with either of these:

- **A. Evolution API** (linked device): scan a QR code, as in WhatsApp Web.
- **B. Meta's Cloud API**: the official way.

If both are set up, A is used. With neither, Send opens WhatsApp and replies stay
on your phone.

## A. Evolution API

### Risks you're accepting

- It isn't an official API and breaks WhatsApp's terms. **The number can be
  banned**, for a while or for good. Use a spare number you can afford to lose.
- Every one-to-one chat on that number is saved in HaloHaul, so never link a
  personal phone. Groups, statuses and channels are ignored.
- Anyone who gets into the VPS could read and send as that number.
- It can stop working when WhatsApp changes something, until Evolution is updated.

To keep the risk down: only write to people who wrote first or gave you their
number for an order, and never send the same text to many people. HaloHaul sends
nothing by itself, allows 15 messages a minute, and refuses the same text to more
than 5 people an hour.

### Set it up (once, on the VPS)

```
cd /opt/halohaul
bash deploy/evolution/setup.sh
```

It makes fresh secrets in `evolution.env`, a separate database, and starts the
container (pinned to an exact version, reachable only by the app). Then, in
Admin → Settings → WhatsApp, tick the box and scan the code with the spare phone.

Turn the phone on and online at least every two weeks, or WhatsApp logs it out.

### What's kept where

- Chats and files: HaloHaul's own database and R2. Deleting a customer deletes
  their chat.
- Evolution's database: the linked session, and messages from the last 3 days
  (needed to resend a lost message). Older ones go each time a message arrives.

### Look after it

- Memory and errors: `docker stats halohaul-evolution-1`, `docker compose logs evolution`
- Disconnected: Messages shows a warning. Settings → WhatsApp → Link again.
- Updating: check the release notes and security advisories, then change the
  version **and** the `sha256` in `docker-compose.yml`.
- Stop using it: Unlink in Settings, take `evolution` out of `COMPOSE_PROFILES`
  and the `EVOLUTION_` lines out of `.env`, then
  `docker compose --profile evolution rm -sf evolution && docker compose up -d`.

## B. Meta's Cloud API

### What to know first

- **The number.** A number added straight to the Cloud API can't also be used in
  the WhatsApp app, so use a spare SIM. Keeping your current WhatsApp Business
  app number ("coexistence") is only possible through a Meta partner.
- **The 24-hour rule.** You can write freely for 24 hours after a customer's last
  message. After that, or to write first, only approved templates can be sent.
- **Cost** (from 1 October 2026): the first 1,000 replies a month per number are
  free, then Meta charges. Templates are charged. Add a payment method, or Meta
  stops delivering once the free replies run out.
  See https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- **Permission.** Only message people who agreed to hear from you on WhatsApp.

### 1. Meta

1. At https://developers.facebook.com create an app for **WhatsApp**, linked to
   your Meta business portfolio (business.facebook.com).
2. Under **WhatsApp → API Setup**, add and verify your phone number. Note the
   **Phone number ID** and **WhatsApp Business Account ID**.
3. In Business settings → **System users**, create an admin system user, give it
   the app and the WhatsApp account, and generate a token that never expires with
   `whatsapp_business_messaging` and `whatsapp_business_management`.
4. Under **App settings → Basic**, note the **App secret**.
5. Make a verify token: any long random text (`openssl rand -hex 24`).

### 2. The VPS

Add to `/opt/halohaul/.env` (never to git or a chat):

```
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
```

Then `docker compose up -d`.

### 3. The webhook

In the Meta app, **WhatsApp → Configuration**:

- Callback URL: `https://halohaul.com/api/whatsapp/webhook`
- Verify token: the one from step 1.5
- Subscribe to **messages** (and **smb_message_echoes** if you use coexistence)

Publish the app (Live mode). Send your number a message: it should appear in
Admin → Messages within a few seconds.

### 4. Templates

Create them in WhatsApp Manager as **Utility**, with **named** variables. Use
these names and they fill themselves in from the chosen order: `name`, `order`,
`item`, `amount`, `pickup_point`, `pickup_window`, `tracking`. A template can't
start or end with a variable. For example:

> Hi {{name}}, your quote for order {{order}} ({{item}}) is ready: {{amount}}. Review it on HaloHaul when you're ready.

New ones show up in the inbox within five minutes of approval.

### If something's wrong

- **Nothing arrives:** check the webhook is subscribed to *messages* and the app
  is live. `docker logs halohaul-app-1 | grep whatsapp` shows errors.
- **"Meta no longer accepts the access token":** make a new one (step 1.3).
- **A file won't open:** Meta keeps received files for 7 days. HaloHaul copies
  them straight away; files over 16 MB aren't copied.
