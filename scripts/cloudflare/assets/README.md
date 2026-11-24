# Runtime fixture assets

These assets are test-only external response fixtures; they are not production OG fonts or public assets.
Runtime tests never download them. `provenance.json` records original public URLs, sizes and SHA-256 hashes.

- Noto Sans JP: Google Fonts, SIL Open Font License 1.1, copyright 2014–2021 Adobe.
  The 12.4 KB TTF is the original Google Fonts `text=` subset for the recorded Japanese test characters.
  The CSS responses are recorded Google Fonts responses, including CJK unicode-range detection.
  See `NotoSansJP-OFL.txt`; no glyph outlines, font names or metadata were edited locally.
- Lobster emoji: Twemoji 14.0.2, Twitter, Inc. and contributors, graphics under CC BY 4.0.
  `1f99e.svg` is unmodified. Source and license: https://github.com/twitter/twemoji/tree/v14.0.2 .
  See `Twemoji-LICENSE-GRAPHICS.txt` and https://creativecommons.org/licenses/by/4.0/ .
- Image resizing: Leaflet 1.9.4's installed `dist/images/marker-icon-2x.png`, 50×82 pixels.
  Tests read the dependency file directly; this directory retains `Leaflet-LICENSE.txt` (BSD 2-Clause).
  Copyright 2010–2023 Volodymyr Agafonkin and 2010–2011 CloudMade.

Only the exact recorded emoji/font requests and the fixture Storage image paths are served.
Other origins, paths, methods and unsupported font text remain denied. This does not clear rights
for the eight existing production images excluded from the later remote source export.
