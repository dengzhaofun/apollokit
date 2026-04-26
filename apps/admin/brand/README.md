# Brand source assets

Source PNGs for the ApolloKit logo. **Not** served at runtime — these are checked
in only so the public-facing derivatives in `../public/` can be regenerated.

| File | Used for |
|---|---|
| `logo-mark.png` (1024+) | Source of `../public/{favicon.ico, logo192.png, logo512.png}` |
| `logo-wordmark.png` | README hero image (rendered by GitHub via relative path) |

## Regenerate public derivatives

```sh
cd apps/admin/public

magick ../brand/logo-mark.png -fuzz 5% -trim +repage \
  -background white -gravity center -resize 410x410 -extent 512x512 \
  -strip logo512.png

magick ../brand/logo-mark.png -fuzz 5% -trim +repage \
  -background white -gravity center -resize 154x154 -extent 192x192 \
  -strip logo192.png

magick ../brand/logo-mark.png -fuzz 5% -trim +repage \
  -background white -gravity center -resize 50x50 -extent 64x64 \
  \( -clone 0 -resize 48x48 \) \
  \( -clone 0 -resize 32x32 \) \
  \( -clone 0 -resize 24x24 \) \
  \( -clone 0 -resize 16x16 \) \
  -colors 256 favicon.ico
```
