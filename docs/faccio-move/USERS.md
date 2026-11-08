# Pago is moving to pago.faccio.app: texts for users

Pago's interface is in English, so these texts are in English. Replace
`[DATE]` with the day the old address starts redirecting.

Old address: `pago.alaindichiappari.dev`. New address: `https://pago.faccio.app`.

---

## In-app banner (old address only)

Shown by the app itself when `VITE_MOVED_*` is set (see RUNBOOK.md):

> Pago has a new address: **pago.faccio.app**. Please switch before [DATE].
> Your data stays the same, just sign in again there. **[Open the new address]**

---

## Telegram message (from the bot or by hand)

> Pago has a new home: https://pago.faccio.app
>
> Your account and all your data are the same. On the new address you only
> need to sign in again (with a Telegram code), and add your passkey again
> if you use one.
>
> The old address works until [DATE], then it sends you to the new one.
> Questions: info@faccio.app

Reminder, one week before:

> Reminder: from [DATE] Pago is only at https://pago.faccio.app. If you
> added Pago to your home screen, add it again from the new address.

---

## Email

**Subject:** Pago has a new address: pago.faccio.app

> Hi,
>
> Pago now lives at **https://pago.faccio.app**. It is the same app, with
> the same account and the same data. Only the address changes.
>
> What to do (2 minutes):
>
> 1. Open https://pago.faccio.app
> 2. Sign in again with a Telegram code.
> 3. If you use a passkey, add it again: Settings, Passkeys, "Register a new passkey".
> 4. If Pago is on your home screen, add the new address to the home screen
>    and remove the old icon.
>
> The old address keeps working until [DATE]. After that it sends you to the
> new one automatically.
>
> Login code emails now come from **noreply@faccio.app**. If you do not see
> one, check your spam folder once and mark it as "not spam".
>
> Questions? Write to info@faccio.app.
>
> More about Pago: https://faccio.app/pago
>
> Thanks,
> Alain

---

## API notice (only for people with an API token or an SDK)

**Subject:** Pago API: new address

> The Pago API moved to **https://pago-api.faccio.app**. Your API token
> does not change.
>
> Update the base URL in your scripts or SDK config:
>
> - Old: `https://pago-api.alaindichiappari.dev/web`
> - New: `https://pago-api.faccio.app/web`
>
> The old address keeps working for now. We will give you at least two
> weeks' notice before it stops. After that, API calls to it get a clear
> error that points to the new address.
>
> Questions: info@faccio.app

---

## How to move (short guide)

**1. Open the new address**

Go to https://pago.faccio.app (or tap "Open the new address" in the banner
on the old site).

**2. Sign in again**

Type your Telegram username and tap "Send code". The bot sends you a code
in Telegram. You are signed out on the new address because it is a new
website for your browser. Your data is all there.

**3. Add your passkey again (if you use one)**

Passkeys belong to a web address, so the old one does not work on the new
address. After signing in: Settings, Passkeys, "Register a new passkey". Next time
you can sign in with Face ID, Touch ID or your device PIN. You can remove
the old passkey from the list.

**4. Home screen icon (if you added Pago to it)**

The old icon keeps opening the old address. Add the new one and remove the
old one.

iPhone (Safari):

1. Open https://pago.faccio.app in Safari.
2. Tap the Share button, then "Add to Home Screen", then "Add".
3. Press and hold the old Pago icon, tap "Remove App", then "Delete from
   Home Screen".

Android (Chrome):

1. Open https://pago.faccio.app in Chrome.
2. Tap the three dots menu, then "Add to Home screen" (or "Install app").
3. Press and hold the old Pago icon and drag it to "Remove" (or tap
   "Uninstall").

**5. Small things to set again**

"Hide amounts" (the eye icon) starts off on the new address. Turn it on
again if you use it.

---

## What does NOT change

- Your account, your transactions, budgets, recurring items and reports.
- The Telegram bot: same bot, same chat, it keeps working during the move.
  Its "Web Dashboard" button opens the new address.
- Your API token, if you have one.

Contact: info@faccio.app
