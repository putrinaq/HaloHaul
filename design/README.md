# Design references

Source of truth: [Figma — HaloHaul Proxy Buying Service](https://www.figma.com/design/XPvUgIj59J6Rx9B1WpakVL/HaloHaul---Proxy-Buying-Service).

The PNG/JPG exports in this folder are kept **out of git** (≈36 MB). Re-export
them from Figma if they're missing. Web-optimised versions of the photos are
committed under `public/` when the pages that use them are built.

| File | What it is |
|---|---|
| `screens/home-full.png` | Customer home page, full length |
| `screens/home-hero.png` | Home hero detail with floating cards |
| `screens/admin-need-action.png` | Admin "Need Action" board |
| `screens/admin-order-detail.png` | Admin order detail (early) |
| `screens/admin-components.png` | Admin nav states and filter chips |
| `screens/admin-icons.png` | Admin icon set |
| `photos/*` | Home page photography (hero, start cards, process steps) |

The brief (`docs/BRIEF.md`) wins wherever these designs disagree with it. In particular:

- The frames still say "Avela", "Paid via Avela" and "Haulo price". The name is **HaloHaul**.
- "Ready to Consilidate" is spelled **Ready to Consolidate**.
- "Mark as Completed" is replaced by one context-aware primary action per card.
