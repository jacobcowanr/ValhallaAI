# Norse font — permission request

**Status:** draft, **not sent**. Jacob sends it from his own address; an agent cannot ask on his behalf.
**Date:** 09.22.2026
**Recipient:** `contact@joelcarrouche.com` (the address the font's author publishes for exactly this)

## Why this exists

`src/assets/fonts/Norse.otf` and `Norse-Bold.otf` are tracked in this repository. The *Joël Carrouché Free Font License* v1.2 (February 2019), read from the licence file that ships inside the font's own download rather than from the website, grants embedding — **"You may embed the font file in pdf documents, applications, web pages"** — and restricts redistribution: **"You may not redistribute or share this font without written permission of Joël Carrouché."**

The built app is covered: the font is embedded inside the executable, and no loose `.otf` ships with it. The **repository** is not: `git clone` hands anyone the two raw files. So the app can be shipped today; only publication of the source is waiting on the reply.

A yes costs nothing and settles it permanently. A no means one of the fallbacks in [CONTRIBUTING.md](../CONTRIBUTING.md#known-open-issues) — untrack the files and have the install guide point at the author's download page, rewrite history so the blobs are gone, or swap for an SIL-OFL face.

## The email

**Subject:** Permission to include the Norse font in an open-source app

Hello Joël,

I have built a small open-source desktop application — a local AI chat client — and it uses Norse for its headings. It suits the project exactly, and I would like to publish the source.

I read the licence file that ships with the download (`freefont_license.txt`, *Joël Carrouché Free Font License* v1.2) and understood it this way: embedding the font in an application is granted, but redistributing the font files needs written permission first. The application embeds the font inside its executable, so I believe that part is covered. What I am unsure about is the **source repository**, because it currently contains the two `.otf` files, which means anyone who clones it could download them. I would rather ask than assume.

So: **may I have your written permission to keep the Norse font files in the public repository for this app?**

If you say yes, I will credit you in the README, link to your site, and keep the licence file alongside the fonts. If you would rather not, that is completely fine — I will remove the files from the repository and ask anyone building from source to download Norse from you directly, or swap in another typeface. Either way the app itself can keep using it.

Thank you for making Norse free for commercial use. It is a lovely piece of type design, and it has done exactly the job I needed.

Jacob Cowan

## What to do with the reply

Append the outcome under this line — the note stays a record of a request *and its answer* rather than being rewritten when the answer arrives. If the answer is yes, no code changes are needed. If no, options 2–4 in CONTRIBUTING.md become live, and the history note there is the one that matters: `git rm --cached` alone leaves every blob reachable in every clone.

**Outcome, 2026-09-25: no reply.** Sent 2026-09-23; two days is not long for a cold email, but Jacob judged a reply unlikely and chose not to block publishing on it indefinitely. Option 4 from the list above — swap for an SIL-OFL face — was chosen over options 2/3 (untrack + manual-download, or a history rewrite) since it's the only fallback that keeps CI and every future build working with zero extra steps for anyone building from source. `src/assets/fonts/Norse.otf` and `Norse-Bold.otf` are removed from `HEAD`; `UnifrakturCook-Bold.ttf` (SIL OFL, `google/fonts`) replaces them, with its `OFL.txt` shipped alongside per the licence's own requirement. If Joël Carrouché ever does reply yes, reverting is a straightforward font swap back — nothing else in this decision depends on the answer.