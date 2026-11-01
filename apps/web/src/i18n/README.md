# Interface translations

- `locales/en.json` is the source. Every visible string in the web app uses one of its keys.
- `es`, `fr`, `ar` and `he` are machine-assisted drafts. Have a professional translator review them before release.
- Arabic and Hebrew are right-to-left: choosing them sets `<html dir="rtl">`, and layouts use CSS logical properties so
  they mirror.

## Adding a language

1. Add it to `LANGUAGES` in `packages/shared/src/regional.ts` (code, names and direction), and to `LOCALES` in
   `packages/shared/src/organization.ts` so organisations can choose it.
2. Copy `locales/en.json` to `locales/<code>.json` and translate the values. Keep every key and every `{placeholder}`.
3. `npm test` checks that each language file has exactly the keys and placeholders of the English one.

## Messages from the API

The API answers in English. `translateServerMessage` in `index.ts` translates known messages by their exact text and
shows anything else as sent.
