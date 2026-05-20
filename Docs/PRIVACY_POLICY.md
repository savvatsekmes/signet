# Privacy Policy

**Effective date: 2026-05-20**
**Version: 1.0**

This Privacy Policy explains what data the **Signet** application ("the Software") collects, processes, or transmits. It is written to be honest and short.

## TL;DR

**Signet collects no personal data.** No account, no telemetry, no analytics, no error reporting, no advertising identifiers, no cookies. Your vault, your password, your files, your recovery shards, and the entries you create stay on your computer. They are never transmitted to us or to any third party by the Software.

## What stays on your device

- Your **vault file** (typically `vault.signet`), encrypted with your master password using Argon2id key derivation and XChaCha20-Poly1305 authenticated encryption.
- A **`last_vault.txt`** file next to the Signet executable, recording the path of the vault you most recently opened, so the app can re-open it on next launch.
- A **`skipped_update.txt`** file next to the Signet executable, recording any version number you clicked "Skip this version" on, so the update notification does not reappear.
- A **`dev.log`** file (only if you used the dev launcher), recording build output from the development server.

These files exist only on your machine. You can delete them at any time using your operating system's file manager.

## What the Software sends over the network

Signet does **not** make any network request automatically except for one purpose:

- **Update check.** On launch, and when you click "Check for updates" in Settings, the Software makes one HTTPS request to the public GitHub Releases API (`https://api.github.com/repos/savvatsekmes/signet/releases/latest`) to see whether a newer version of Signet has been published. The request contains a generic `User-Agent` header (`Signet-Updater`) and nothing else identifying. The Software does **not** transmit your vault, your password, your IP address through any service we operate, or any other data. GitHub may log the request as part of its standard server logs; that logging is governed by [GitHub's Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) and not by us.

That is the only network call. There is no telemetry, no crash reporting, no analytics, no ping-home, no remote configuration, no cloud sync.

## What we collect

**Nothing.** We have no servers that receive data from the Software. We have no database of users. We could not identify you if we wanted to.

## Recovery card PDFs

If you generate a recovery card PDF, the file contains:
- A QR code encoding one Shamir secret-sharing shard of your master key,
- The shard as readable text,
- The name and "intended access" of the assigned beneficiary,
- The file path where you stored the vault,
- The generation date.

These PDFs are saved to wherever you choose. We do not see them, do not collect them, and have no copy of them. Distribution of these PDFs is your responsibility — they are sensitive and grant access to your vault when combined with the required number of other shards.

## Bulk export contents

If you use the "Export all" feature, the Software writes decrypted copies of your vault contents to a folder you choose. **The exported files are in the clear**, by design — passwords as CSV, documents as HTML, crypto seeds as plain text. We do not see them, but if you mishandle them (e.g. upload them somewhere), anyone with access to that location can read them. This is on you.

## Children's privacy

The Software is not directed at children under 13, and we do not collect any data about anyone, including children.

## Third-party services we do not use

The Software does **not** use, integrate with, or transmit data to: Google Analytics, Sentry, Datadog, Mixpanel, Amplitude, Segment, Facebook Pixel, Microsoft AppCenter, Firebase, Crashlytics, OneSignal, or any advertising network, attribution provider, or marketing service.

## Changes

If we ever change this policy — for example, adding an opt-in cloud sync feature — the change will be reflected in the **Version** number at the top of this document and announced in the release notes for the version that introduces it. We will never add data collection silently.

## Contact

Questions: **savva@savvatsekmes.com**.
