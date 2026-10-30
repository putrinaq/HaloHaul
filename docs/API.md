# Category API

Public, read-only JSON endpoints for the product categories students can order
in, and the measurements each one asks for. The order form's category search
uses them; anything else (a future app, a chatbot) can too.

- No sign-in needed: categories aren't personal data. Saved measurements are
  never in these responses.
- Rate limit: 240 requests per minute per IP across these endpoints. Over it:
  `429` with a `Retry-After` header.
- Errors are JSON: `{ "error": "message" }`.
- Responses carry an `ETag` and `Cache-Control: public, no-cache`. Send the tag
  back in `If-None-Match` and you get an empty `304` until something changes.
- Only orderable categories appear: active, published and physical (digital
  products aren't offered).

## `GET /api/categories`

Every category, in the admin's display order. With `q`, only the matches, best first.

| Parameter | | |
|---|---|---|
| `q` | optional, ≤ 80 characters | Search text. Matches the name, the admin's search words (synonyms, Malay, Chinese), and one typo in longer words. A whole product title works too: results are ranked by how many of its words matched. |
| `limit` | optional, 1–100, default 100 | Most results to return. |

```json
{
  "query": "kasut",
  "total": 1,
  "categories": [
    {
      "key": "shoes",
      "name": "Shoes",
      "icon": "Footprints",
      "aliases": ["sneakers", "kasut", "鞋"],
      "versionId": "6f1c…",
      "version": 1,
      "allowedShippingModes": ["air", "air_sensitive", "sea", "pdd_direct"],
      "restrictedNote": null,
      "measurements": [{ "key": "foot_length_cm", "label": "Foot length", "unit": "cm", "required": "always" }],
      "fieldCount": 3,
      "match": { "via": "kasut", "highlight": [] }
    }
  ]
}
```

- `measurements[].required`: `"always"`, `"sometimes"` (only under a condition,
  e.g. AXIS when CYL isn't 0), or `"optional"`.
- `match` is `null` without `q`. `via` is the search word that matched when the
  name didn't; `highlight` lists `[start, end)` ranges of the name that matched.
- `400` for a bad `q` or `limit`.

## `GET /api/categories/{key}`

One category's published form: everything needed to show it and validate it
exactly as the server will.

```json
{
  "category":   { "key": "ring", "versionId": "…", "definition": { … }, "defaultParcel": { … }, … },
  "summary":    { …same shape as a list item, without "match"… },
  "definition": { "sections": [ … ], "option": { … } },
  "measurements": [ { "key": "ring_inner_circumference_mm", "label": "Ring inner circumference", "unit": "mm", "min": 35, "max": 80, "step": 0.5, … } ],
  "fields": [ { "key": "ring_inner_circumference_mm", "kind": "measurement", "label": "Ring inner circumference", "unit": "mm", "required": true, "section": 0, … } ],
  "helpImages": { "admin/help/<uuid>.webp": "/api/help-images/admin/help/<uuid>.webp" }
}
```

- `fields` are in form order, with measurement fields filled in from the library
  (label, unit, min, max, step, how-to-measure text). Conditional fields carry
  `showIf` / `requiredIf`.
- `definition` + `measurements` are what `validateCategoryInput` takes, so a
  client can validate offline with the same code (`src/domain/catalog.ts`).
- `404` for an unknown key or one that can't be ordered.

## `GET /api/help-images/{key}`

A stable address for a "how to measure" picture. It redirects (`302`) to a
short-lived signed URL. Add `.thumb` before `.webp` for the 400px thumbnail.
Only pictures the published categories use are served; anything else is `404`.

## Where the code is

| | |
|---|---|
| Route handlers | `src/app/api/categories/`, `src/app/api/help-images/` |
| Response shapes and builders | `src/domain/categoryApi.ts` |
| Search and ranking | `src/domain/categorySearch.ts` (the order form runs the same function) |
| Browser client and hooks | `src/components/category/categoryApiClient.ts` |
| Search box | `src/components/category/CategoryCombobox.tsx` |
| Tests | `src/domain/categorySearch.test.ts`, `src/domain/categoryApi.test.ts`, `e2e/categories-api.spec.ts`, `e2e/order-form*.spec.ts` |

Search words are edited per category in **Admin → Settings → Categories →
Basic info → Search words**. Changes show up in the API immediately.
