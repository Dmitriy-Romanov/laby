# Hosting LABY

LABY is a static site: `index.html`, `game.js`, and `style.css`. It does not need a backend, database, build step, or long-running server. The fastest good hosting choice is static hosting, not a cloud VM.

## Recommended Path

Use **GitHub Pages** first.

- Cost: free for public repositories; usable for private repositories depending on GitHub plan/settings.
- Fit: excellent for this project because files can be served directly from the repo root.
- Setup: push the repo, open repository settings, enable Pages from the root or `docs/` folder.
- Result: a stable HTTPS URL without maintaining a server.
- Docs: https://docs.github.com/pages

This is better than AWS/GCP for the current game because there is no server to operate, no cloud billing surface to watch, and no deployment pipeline to design.

## Good Free Static Alternatives

### Cloudflare Pages

- Fit: static sites, global CDN, custom domains, Git integration.
- Cost: has a free plan suitable for small static apps.
- Why use it: good if GitHub Pages limits or private repo constraints become annoying.
- Docs: https://developers.cloudflare.com/pages/

### Netlify

- Fit: static sites and simple web apps.
- Cost: has a free starter tier.
- Why use it: very simple drag-and-drop or Git deployment.
- Docs: https://docs.netlify.com/

### Vercel

- Fit: frontend projects and static sites.
- Cost: has a free Hobby plan for personal/non-commercial use.
- Why use it: good developer UX, but more platform than LABY currently needs.
- Docs: https://vercel.com/docs

## AWS Option

AWS can host this, but it is not the shortest path.

### AWS Amplify Hosting

- Fit: static web apps with Git deployment.
- Free tier: AWS offers a free tier, but quotas and billing terms should be checked before use.
- Why not first: more account/billing setup than GitHub Pages for the same result.
- Docs: https://docs.aws.amazon.com/amplify/latest/userguide/hosting.html
- Free tier page: https://aws.amazon.com/free/webapps/

### S3 + CloudFront

- Fit: production-grade static hosting.
- Why not first: powerful, but setup is too heavy for this project right now.
- Use later if: custom domain, CDN/cache tuning, or AWS-only deployment becomes important.

## Google Cloud Option

Google Cloud can work, but a VM is overkill for LABY.

### Compute Engine free tier VM

- Fit: a small Linux VM can serve static files over nginx.
- Why not first: you must maintain OS updates, firewall rules, nginx, TLS, and uptime.
- Good for: learning cloud machines or hosting multiple services from one box.
- Docs: https://cloud.google.com/free/docs/free-cloud-features

### Firebase Hosting

- Fit: static sites with HTTPS and CDN.
- Why use it: better than a VM for a static game if choosing Google tooling.
- Docs: https://firebase.google.com/docs/hosting

## Telegram Direction

If the target becomes Telegram, the better route is likely a **Telegram Mini App**, not a classic chat bot. The game is visual and browser-based, so it maps naturally to a hosted web app opened inside Telegram.

Minimal path:

1. Host LABY as HTTPS static site.
2. Create a Telegram bot through BotFather.
3. Register the hosted URL as a Mini App / Web App entry.
4. Keep game state local at first; add backend only if shared scores or accounts become necessary.

## Decision

Start with GitHub Pages. Move to Cloudflare Pages if private repo / custom domain / CDN handling matters. Use AWS, Google Cloud, or a VM only when there is a backend or an explicit goal to practice cloud infrastructure.
