# RuleQuant mainland mirror

RuleQuant keeps GitHub Pages as a backup and can publish the same verified static build to Tencent CloudBase for direct access from mainland China.

## Why CloudBase

- Tencent currently provides one long-term free experience environment per account.
- The free environment includes 3,000 resource points each month.
- The free period can be renewed for six months at a time during the final month before expiry.
- The project is about 3.4 MB, well below the static hosting capacity.
- The existing hourly GitHub Actions job can deploy both sites from one build.

CloudBase does not support automatic renewal of the free period. Add a calendar reminder and renew it manually every six months.

## One-time setup

1. Open the CloudBase console and create a free experience environment.
2. Enable static website hosting and record the environment ID.
3. Create a Tencent Cloud API key with only the permissions needed for this environment.
4. Add these GitHub Actions repository secrets to the application repository:
   - `TCB_SECRET_ID`
   - `TCB_SECRET_KEY`
   - `TCB_ENV_ID`
5. Add repository variable `TCB_PUBLIC_URL`, using the CloudBase static hosting origin without a trailing slash.
6. Run the `Refresh RuleQuant GitHub Pages Data` workflow manually once.

The workflow deploys the app to `/rulequant-terminal-pages` and adds a root redirect to the dashboard. If the CloudBase secrets are absent, GitHub Pages deployment continues normally.

## Data and formula safety

- Website code, built-in formulas, and synced draw data are identical on both hosts.
- Formulas added by a user are stored in that browser. Moving to a different host changes the browser storage origin.
- Before switching a phone or computer to the CloudBase URL, export the formula library once from the old site and import it on the new site.
- Later code and data updates do not overwrite the imported local formula library.

## Verification

Every successful publish checks both the state JSON and dashboard page when `TCB_PUBLIC_URL` is configured. A CloudBase verification failure fails the workflow instead of silently reporting success.
