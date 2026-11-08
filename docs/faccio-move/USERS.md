# Pago is moving to pago.faccio.app: texts for users

Pago's interface is in English, so these texts are in English. Replace
`[DATE]` with the day the old address starts redirecting.

Old address: `pago.alaindichiappari.dev`. New address: `https://pago.faccio.app`.

What changes for people, in short:

- Pago is now a web app only. The Telegram bot is switched off.
- On the new address you sign in with **Google** or a **passkey**.
- Your account and all your data stay the same, including everything you
  added with the bot.

---

## In-app banner (old address only)

Shown by the app itself when `VITE_MOVED_*` is set (see RUNBOOK.md):

> Pago has a new address: **pago.faccio.app**. Please switch before [DATE].
> Your data stays the same. Sign in there with Google. **[Open the new address]**

When you are signed in on the old address, the button also links your
account, so Google finds it even if your Google email is a different one.

---

## Last Telegram message (sent once by the farewell tool, before the bot stops)

> Pago is now a web app only, and this Telegram bot is being switched off.
>
> Your account and all your transactions are safe. Open
> https://pago.faccio.app and sign in with Google. If your Google email is
> different from the one in Pago, first open the old Pago web app and press
> "Open the new address" there, so we can link your account.
>
> Then create a passkey in Settings for quick sign-in.
>
> Questions? Write to info@faccio.app

---

## Email (sent once, by hand, from info@faccio.app)

**Subject:** Pago has a new address: pago.faccio.app

> Hi,
>
> Pago now lives at **https://pago.faccio.app**. It is the same app, with
> the same account and the same data. Two things change:
>
> - You sign in with **Google** (or a passkey), no more codes.
> - The **Telegram bot is switched off**. Everything you added with it is
>   in the web app.
>
> What to do (2 minutes):
>
> 1. Open the old address, https://pago.alaindichiappari.dev, and press
>    **"Open the new address"** in the banner at the top. (This links your
>    account. If you cannot sign in there, skip this step.)
> 2. On https://pago.faccio.app tap **Continue with Google**.
> 3. Create a **passkey** when Pago asks. Next time you sign in with Face ID,
>    Touch ID or your device PIN.
> 4. If Pago is on your home screen, add the new address and remove the old
>    icon.
>
> Can't get in, or Pago shows an empty account? Do not add data there.
> Write to info@faccio.app with the email of your Google account and I will
> link it.
>
> The old address works until [DATE]. After that it sends you to the new
> one automatically.
>
> More about Pago: https://faccio.app/pago
>
> Thanks,
> Alain

Reminder, one week before:

**Subject:** Reminder: Pago moves on [DATE]

> From [DATE] Pago is only at https://pago.faccio.app. Sign in there with
> Google. If you have not moved yet, open the old address first and press
> "Open the new address". Questions: info@faccio.app

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

**1. Start on the old address (recommended)**

Open https://pago.alaindichiappari.dev. If you are signed in, tap **"Open
the new address"** in the banner. This takes your account with you, even
if your Google email is not the one you used in Pago.

**2. Sign in with Google**

On https://pago.faccio.app tap **Continue with Google** and pick your
Google account. You see all your data.

**3. Create a passkey**

Pago asks right away ("Create a passkey"), or later in Settings, Passkeys.
Next time tap **Sign in with a passkey**. Nothing to type.

**4. Remove the old passkey from your password manager**

Your old Pago passkey belongs to the old address and will not work any
more. In your password manager (iCloud Keychain, Google Password Manager,
1Password and so on) search for `pago.alaindichiappari.dev` and delete
that passkey. Keep the one for `pago.faccio.app`.

**5. Home screen icon (if you added Pago to it)**

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

**6. Telegram**

The bot is switched off. You can delete the chat with it. Add transactions
on https://pago.faccio.app instead (type them in plain words, like in the
bot).

**7. Small things to set again**

"Hide amounts" (the eye icon) starts off on the new address. Turn it on
again if you use it.

---

## What does NOT change

- Your account, your transactions, budgets, recurring items and reports,
  including everything you added with the Telegram bot.
- Your API token, if you have one.

What stops: the Telegram bot, with its weekly and monthly recaps and its
budget warnings.

Contact: info@faccio.app
