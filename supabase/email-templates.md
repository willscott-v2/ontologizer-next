# Supabase Auth email templates

Paste these into the Supabase dashboard → Authentication → Email Templates for
the Ontologizer project. Variables (`{{ .ConfirmationURL }}`, etc.) are
resolved server-side by Supabase at send time.

## Magic Link (primary — this is what fires for new signups and sign-ins)

### Subject

```
Your Ontologizer sign-in link
```

### Plain-text fallback

```
Click the link below to sign in to Ontologizer:

{{ .ConfirmationURL }}

The link expires in 1 hour and can be used once. If you didn't request this, ignore the email — nothing happens on your account.

Ontologizer — a free tool from Search Influence
https://www.searchinfluence.com
```

---

## Confirm Signup (legacy — only fires if password-based signup is re-enabled)

### Subject

```
Welcome to Ontologizer — confirm your email
```

### Plain-text fallback

```
Welcome to Ontologizer.

Confirm your email to activate your account. You'll get 5 free analyses per month — or bring your own API keys for unlimited use.

{{ .ConfirmationURL }}

The link expires in 24 hours. If you didn't sign up for Ontologizer, ignore this email — no account will be created.

What you can do with Ontologizer:
- Extract named entities from any page, linked to Wikipedia, Wikidata, and Google's Knowledge Graph
- Generate production-ready JSON-LD schema markup
- See how Google's AI Mode might decompose queries about your content

Ontologizer — a free tool from Search Influence
https://www.searchinfluence.com
```
