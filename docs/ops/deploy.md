# Putting City Qoti online

City Qoti runs on Cloudflare as one Worker: it serves the game pages and keeps each valley in a
Durable Object (a small database per valley). The free plan is enough for two players.

Once the steps below are done, every change merged into `main` goes online by itself in a few
minutes. Nobody needs to run anything by hand.

## One-time setup (about 15 minutes)

1. Create a free Cloudflare account at https://dash.cloudflare.com/sign-up and confirm your email.
2. In the Cloudflare dashboard, open **Workers & Pages** once and pick a `workers.dev` subdomain
   when it asks (for example `kat-and-evgeny`). The game will live at
   `https://city-qoti.<your-subdomain>.workers.dev`.
3. Find your **Account ID**: on the dashboard home page, open the menu next to your account name
   and choose **Copy account ID**. Keep it in a note for step 6.
4. Create an API token: go to https://dash.cloudflare.com/profile/api-tokens, press
   **Create Token**, choose the **Edit Cloudflare Workers** template, leave the defaults, press
   **Continue to summary**, then **Create Token**. Copy the token now; Cloudflare shows it only once.
5. On GitHub, open the repository, then **Settings**, **Secrets and variables**, **Actions**.
6. Press **New repository secret** twice to add:
   - `CLOUDFLARE_API_TOKEN` with the token from step 4.
   - `CLOUDFLARE_ACCOUNT_ID` with the ID from step 3.
7. Open the **Actions** tab, pick **Deploy** on the left, and press **Run workflow** on `main`.
   When it turns green (a few minutes), open the address from step 2. That is the game.

## Afterwards

- Merging into `main` deploys again automatically. Valleys survive deploys.
- If a deploy fails, the **Actions** tab shows a red mark; the previous version keeps running.
- To stop deploys, delete either secret. To take the game offline, delete the `city-qoti`
  Worker in **Workers & Pages** (this also deletes every online valley, so export first).

## From a developer machine

`npx wrangler login` once, then `npm run deploy` from the repository root. It builds the client
and publishes the Worker with the same settings as the GitHub job (`apps/server/wrangler.toml`).
