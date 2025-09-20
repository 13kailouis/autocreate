# CineSynth

**AI-Powered Video Narration Tool**

CineSynth transforms text scripts into marketing-ready videos in minutes. Powered by Gemini and Imagen models, it handles scene analysis, placeholder footage, subtitles and final video rendering right in your browser.

## Features

- Smart narration analysis with Google Gemini
- Automatic editing and subtitle generation
- Premium: AI‑generated imagery and TTS narration
- Premium: One-click AI video generation
- Browser-based WebM to MP4 conversion via ffmpeg.wasm
- Placeholder footage is pulled as videos directly from Wikimedia Commons, now
  selected randomly from the best search results so each scene has different
  footage when possible

## Getting Started

1. Install dependencies
   ```bash
   npm install
   ```
2. Create a `.env.local` file and set `GEMINI_API_KEY`. Placeholder footage now comes from Wikimedia Commons and is provided as video only, so no additional API keys are required. If the landing page should redirect to another domain when starting the app, set `LAUNCH_URL` to that URL.
3. Start the development server
   ```bash
   npm run dev
   ```

Development mode automatically provides the required cross-origin isolation headers so ffmpeg.wasm can use `SharedArrayBuffer`. Always run the app via `npm run dev` or `npm run preview` after building.

### Faster MP4 Conversion

By default the browser-based conversion uses the `ultrafast` preset for speed. Edit `services/mp4ConversionService.ts` if you prefer higher quality.

## Deployment

When deploying to Vercel, create a `vercel.json` file so each request includes the cross-origin headers needed by ffmpeg.wasm:

```json
{
  "headers": [
    {
      "source": "/*",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

This ensures the MP4 conversion works correctly in the hosted app.

If the landing page is served separately from the full editor, provide the
target URL in a `LAUNCH_URL` environment variable. Visitors clicking
**Get Started** will be redirected there.

