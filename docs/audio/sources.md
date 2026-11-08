# Audio sources and licensing research

Status: desk research from web searches, not from reading each license file. Licenses MUST be re-verified against the actual license file in each download when the I2 audio cycle fetches them, and every asset recorded in CREDITS.md (name, author, license, URL, date checked).

Key redistribution concern: we ship the audio inside the game bundle, so players download it. Several libraries forbid redistributing the samples "as is" or as a sampler instrument. We must ship processed, trimmed, encoded subsets used in-game (still arguably derivative), and confirm each license permits that. CC0 removes the question.

## Table

| Library | Covers | License | Web game redistribution | Attribution | URL | Confirmed? |
|---|---|---|---|---|---|---|
| VCSL (Versilian Community Sample Library) and VSCO 2 CE | Orchestral strings, winds (clarinet, flute), brass, harp, chromatic percussion, some drums | CC0 (from memory and a secondary source) | Yes if CC0 holds | None required | https://github.com/sgossner/VCSL | No. Search returned nothing on VSCO 2 CE itself; check repo LICENSE and per-folder notes |
| Salamander Grand Piano (Alexander Holm) | Grand piano | CC BY 3.0 | Yes with credit (SFZ project and GitHub both state CC BY 3.0). Derivative encodings are common | Required: credit Alexander Holm, link license | https://sfzinstruments.github.io/pianos/salamander | Yes (two sources) |
| Sonatina Symphonic Orchestra | Strings, winds, brass, chromatic percussion | CC Sampling Plus 1.0 | Probably yes; the restriction is no use of the work to advertise anything but your own work. Sampling Plus is not a standard modern CC license, so legal review advised | Credit per license text | https://github.com/peastman/sso | Partly (GitHub, SFZ list); terms text not read |
| University of Iowa Musical Instrument Samples | Flute, clarinet, strings, brass, vibraphone, marimba, piano, some percussion (anechoic, dry) | Own terms: free, no restriction, reported limit: may not be sold or offered as is | Likely ok when processed into a game, but "as is" clause is a risk | Not required; citing is welcome | https://theremin.music.uiowa.edu/MIS.html | No. Official page not opened; secondary sources only |
| Philharmonia Orchestra samples | Orchestral winds, brass, strings, percussion | Own terms; one mirror says CC BY-SA 3.0 | Reported ok in works, not as is. ShareAlike would be a problem, so avoid unless cleared | Credit | https://philharmonia.co.uk/audio-sound-samples/ | No. Sources conflict; avoid |
| FreePats | Spanish classical guitar (reported CC0), assorted GM-style sets | Per instrument; project rejects CC-SA, many CC0, some GPL with exception | Yes for CC0 sets | None for CC0 | https://freepats.zenvoid.org/ | No. Guitar CC0 claim is secondhand |
| Karoryfer Samples (Meatbass, Sneakybass, Ergo, Swirly Drums, others) | Double bass (pizzicato and arco), brush-flavored drums, percussion | Listed CC0-1.0 on sfzinstruments.github.io; a 2015 blog said CC BY 3.0 for older packs | Yes if CC0 | None if CC0; credit if CC BY | https://sfzinstruments.github.io/basses | Partly. Catalog says CC0, license conflict noted; some Karoryfer libs are commercial (not free) |
| Versilian Virtuosity Drums | Jazz drum kit (sticks, no brushes) | CC0 (per KVR listing) | Yes if CC0 | None | https://www.kvraudio.com/product/virtuosity-drums-by-versilian-studios/details | Partly (single secondary source) |
| OpenAIR | Reverb impulse responses | Varies per file, mostly Creative Commons (a catalog lists v1.0.0 as CC-BY-4.0) | Per file; many allow it | Per file (CC BY needs credit; some are NC, avoid) | https://www.openair.hosted.york.ac.uk/ | Partly. No single license; check each IR |
| Freesound CC0 field recordings | River, wind, birds, crowd chatter | Per sound: CC0, CC BY, CC BY-NC. Filter to CC0 | Yes for CC0 | None for CC0; log URL anyway | https://freesound.org/ | Yes for the per-sound model; each file must be checked |
| Bigsoundbank | Bird and city ambience | CC0 (stated on site) | Yes | None | https://bigsoundbank.com/ | Partly (search snippet only) |
| Discord SFZ GM Bank | General MIDI fill: guitar, vibes, celesta, etc. | Intended CC0, per SFZ file | Yes if CC0 | None | https://github.com/sfzinstruments/Discord-SFZ-GM-Bank | No. Instrument coverage and quality unchecked |

## Recommended set (prefer CC0, then CC-BY)

| Instrument | Pick | License | Note |
|---|---|---|---|
| Piano | Salamander Grand Piano | CC BY 3.0 | Only high quality option; credit Holm. CC0 fallback: VCSL piano |
| Acoustic guitar | FreePats Spanish classical guitar | CC0 (unverified) | Nylon; verify file license |
| Upright bass | Karoryfer Meatbass or Sneakybass | CC0 (verify) | Sneakybass is a quiet pizzicato, good for a cozy walk |
| Drums and brushes | Karoryfer Swirly Drums (brush-played) or Virtuosity Drums | CC0 (verify) | Neither is a true jazz brush kit; see gaps |
| Clarinet | VCSL / VSCO 2 CE | CC0 (verify) | Iowa MIS is a dry backup |
| Flute or whistle | VCSL / VSCO 2 CE flute | CC0 (verify) | |
| Celesta or glockenspiel | VCSL chromatic percussion | CC0 (verify) | Sonatina is a CC fallback |
| Vibraphone | VCSL, else Iowa MIS vibraphone | CC0 / free (verify) | |
| Muted trumpet or flugelhorn | None confirmed | | See gaps |
| Small string section | VCSL / VSCO 2 CE strings | CC0 (verify) | Sonatina strings as fallback |
| Reverb IRs | OpenAIR, CC0 or CC-BY files only | per file | Or generate IRs procedurally |
| Ambience | Freesound filtered to CC0, plus Bigsoundbank | CC0 | Log each URL in CREDITS.md |

## Gaps and fallbacks

- Muted trumpet or flugelhorn: no free source found. Fallback: use VCSL or Sonatina trumpet through a Web Audio bandpass and a straight-mute style filter, or synthesize a soft brass voice.
- True jazz brushes: only stick jazz kit or brush-flavored experimental kits found. Fallback: record our own brush sweeps and taps (cheap, CC0 by us), or synthesize filtered noise swishes.
- Upright bass: CC0 double basses exist but quality and round robins unverified; if weak, synthesize with a plucked-string model.
- Reverb: if no suitable IR is clearly licensed, generate decaying noise impulse responses at runtime.
- Anything in the table marked "No" or "Partly" confirmed: do not ship until the license file is read.
