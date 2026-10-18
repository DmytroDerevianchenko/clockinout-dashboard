# ClockInOut web dashboard

The employer's browser view of ClockInOut: the same accounts, the same API
(Render), the same rules as the phones. Workers use the app; this is for
employers and administrators at a desk.

- **Stack:** React + TypeScript, built with Vite. No framework beyond that.
- **Hosting:** static files on GitHub Pages at <https://app.clockinout.ca>
  (`public/CNAME`), deployed by `.github/workflows/pages.yml` on every push
  to `main`.
- **API:** `src/api/client.ts` is the one door. Base URL from
  `VITE_API_BASE` (default: the Render service). The session token rides in
  the `Authorization` header, exactly as the phones send it.
- **Google sign-in:** set `VITE_GOOGLE_CLIENT_ID` (repository variable for
  the workflow, `.env.local` for dev) and authorize the origin in Google
  Cloud Console; without it the button is simply not shown.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173 — the API allows this origin
npm run build    # type-check + production build into dist/
```

## Phases

1. Foundation — sign in, organization switcher, shell, Home (who is on the clock). **Done.**
2. Team — roster, person record, employer clock actions, tax profile.
3. Payroll — periods, details, Edit Payroll, paystubs, payments, CSV, configuration.
4. Jobs and hours — jobs, geofence, hours per person, route map.
5. Organization — details, features, invoices.
