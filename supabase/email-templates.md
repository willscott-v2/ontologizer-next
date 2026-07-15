# Supabase Auth email templates

**Source of truth note:** these templates are live in the project's auth config
(project `ukwxaubrlvlubttofonv`), pushed via the Management API
(`PATCH /v1/projects/{ref}/config/auth`) on 2026-07-15. If you edit them in the
dashboard, update this file in the same change — the July 2026 Outlook OTP bug
happened partly because the dashboard was edited without updating this file.

## Design rules (learned the hard way — do not regress)

1. **Code-only. Never include `{{ .ConfirmationURL }}` (or any token-bearing
   URL).** The URL and the 6-digit `{{ .Token }}` are the same one-time token.
   Corporate link scanners (Outlook Safe Links, Mimecast, Proofpoint) prefetch
   every URL in the email, consuming the token and invalidating the code
   before the user can type it.
2. **OTP length must stay 6** (`mailer_otp_length: 6` in auth config). The
   login UI, the email copy, and this setting must agree. In July 2026 the
   setting was 8 while everything else said 6 — nobody could sign in.
3. Non-token links (e.g. the searchinfluence.com footer) are fine — scanners
   rewriting them consumes nothing.
4. Both templates matter: existing users get **Magic Link**; brand-new users
   signing in via `signInWithOtp` get **Confirm signup**. Both must show the
   code.

## Settings (Auth config)

| Setting | Value |
|---------|-------|
| `mailer_otp_length` | 6 |
| `mailer_otp_exp` | 3600 (1 hour — email copy says "expires in 1 hour") |
| SMTP | Resend (`smtp.resend.com`), sender `noreply@send.searchinfluence.com` |

## Magic Link (existing users signing in)

### Subject

```
Your Ontologizer sign-in code
```

### Body (HTML)

```html
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f5f7;color:#17374a;line-height:1.55;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
    <tr>
      <td style="background:#012c3a;padding:28px 32px;border-top:3px solid #f07a18;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.01em;">Ontologizer</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#f28a22;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Entity extraction &amp; schema markup</p>
      </td>
    </tr>
    <tr>
      <td style="background:#ffffff;padding:32px;">
        <p style="margin:0 0 16px;font-size:16px;"><strong>Sign in to Ontologizer.</strong></p>
        <p style="margin:0 0 8px;font-size:15px;color:#2f5064;">Enter this 6-digit code on the sign-in page:</p>
        <p style="margin:0 0 24px;font-size:34px;font-weight:800;letter-spacing:6px;font-family:Menlo,Consolas,'Courier New',monospace;color:#012c3a;">{{ .Token }}</p>
        <p style="margin:0 0 6px;font-size:14px;color:#7f8c8d;">The code expires in 1 hour and can be used once. If you requested more than one code, only the newest one works.</p>
        <p style="margin:0;font-size:14px;color:#7f8c8d;">If you didn't request this, ignore this email — nothing happens on your account.</p>
      </td>
    </tr>
    <tr>
      <td style="background:#012c3a;padding:18px 32px;border-radius:0 0 8px 8px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#93a1ad;">Ontologizer is a free tool from <a href="https://www.searchinfluence.com" style="color:#f07a18;text-decoration:none;font-weight:700;">Search Influence</a>.</p>
      </td>
    </tr>
  </table>
</body>
</html>
```

## Confirm signup (new users created via signInWithOtp)

### Subject

```
Welcome to Ontologizer — your sign-in code
```

### Body (HTML)

```html
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f5f7;color:#17374a;line-height:1.55;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
    <tr>
      <td style="background:#012c3a;padding:28px 32px;border-top:3px solid #f07a18;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.01em;">Ontologizer</h1>
        <p style="margin:6px 0 0;font-size:13px;color:#f28a22;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Entity extraction &amp; schema markup</p>
      </td>
    </tr>
    <tr>
      <td style="background:#ffffff;padding:32px;">
        <p style="margin:0 0 16px;font-size:16px;"><strong>Welcome to Ontologizer.</strong></p>
        <p style="margin:0 0 8px;font-size:15px;color:#2f5064;">Enter this 6-digit code on the sign-in page to activate your account. You'll get 5 free analyses per month — or bring your own OpenAI, Gemini, and Google Knowledge Graph keys for unlimited use.</p>
        <p style="margin:0 0 24px;font-size:34px;font-weight:800;letter-spacing:6px;font-family:Menlo,Consolas,'Courier New',monospace;color:#012c3a;">{{ .Token }}</p>
        <p style="margin:0 0 18px;font-size:14px;color:#7f8c8d;">The code expires in 1 hour and can be used once. If you didn't sign up for Ontologizer, ignore this email — no account will be created.</p>
        <p style="margin:24px 0 0;font-size:14px;color:#17374a;"><strong>What you can do with Ontologizer:</strong></p>
        <ul style="margin:8px 0 0;padding-left:20px;font-size:14px;color:#2f5064;">
          <li style="margin-bottom:6px;">Extract named entities from any page and link them to Wikipedia, Wikidata, and Google's Knowledge Graph</li>
          <li style="margin-bottom:6px;">Generate production-ready JSON-LD schema markup</li>
          <li style="margin-bottom:6px;">See how Google's AI Mode might decompose queries about your content, with per-query coverage scoring</li>
        </ul>
      </td>
    </tr>
    <tr>
      <td style="background:#012c3a;padding:18px 32px;border-radius:0 0 8px 8px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#93a1ad;">Ontologizer is a free tool from <a href="https://www.searchinfluence.com" style="color:#f07a18;text-decoration:none;font-weight:700;">Search Influence</a>.</p>
      </td>
    </tr>
  </table>
</body>
</html>
```
