# Brand implementation

Source: user-provided **Ember velocity - MHERO DFC.pdf**, reviewed across all 23 pages. Pages 3–8 define the principal visual system.

| Token | Colour | Application |
| --- | --- | --- |
| Onyx | #1B1110 | Main background |
| Ember | #EF5B25 | Action buttons, emphasis and active states |
| Rust | #A83225 | Restrained warm layers and borders |
| Parchment | #F2D9B9 | Main text and accents |

The guideline's colour ratios are proposals, and pages 3 and 4 differ on the Parchment percentage. The UI uses the specified colours with readability and touch targets taking precedence over rigid percentages.

The hero/torque/afterimage/heat assets are extracted from the supplied guideline. The header uses the exact vector paths from the supplied Logo Lockup.ai white-and-pink artwork, retaining the MHERO mark, divider and Al Ghurair logo together. The lockup remains crisp at all screen sizes. One dominant background motif is used per station, with quiet space around form fields. Display headings are bold and compact, with italic action emphasis. Interface fonts are local Arial/Helvetica fallbacks, keeping operation offline; supplied official font files can replace them later.

Forms support portrait/landscape screens, visible keyboard focus, native country selectors, reduced-motion preferences and 44px-plus primary touch targets. Public pages expose only names and scores, with contact details reserved for authenticated admin views.

## Tablet and main-screen roles

The tablet has a compact game heading followed by registration/sign-in, name confirmation and Start game. On acknowledgement it directs players to the main screen. Completion immediately clears the tablet for the next participant; scores and leaderboard navigation are absent from the tablet. Failed/cancelled matches offer a retry. The separate `/leaderboard/:game` page is for a main-screen browser or an API-backed leaderboard inside the actual game. Admin access remains at `/admin`.
