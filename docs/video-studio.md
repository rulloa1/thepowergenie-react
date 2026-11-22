# Video Studio

Open [Video Studio](http://localhost:3016/video-studio) while the development server is running. Start it with `npm run dev -- --port 3016`. The production build includes `/video-studio.html`; Vercel routes `/video-studio` to it and serves `/api/video-studio` as a server function.

## Create a video

1. Open **Connections** and enter your own OpenAI, PiAPI, and ElevenLabs API keys. Keys are optional for local creation. They remain in memory in the current tab, are forwarded only to the app server and their provider, and are cleared by a reload. The app does not read deployment API secrets.
2. Describe an idea and choose a visual style. **Build storyboard** creates three editable five-second scenes with OpenAI. It replaces the current scenes and narration. Local creation mode makes a simple editable outline instead of calling an AI service.
3. Select each scene. Edit its caption and prompt. **Generate image** submits a Flux task through PiAPI. **Animate** submits a five-second Kling clip using that generated image's public URL. Alternatively, upload a JPG, PNG, WebP, MP4, or WebM. Uploaded media stays in this tab.
4. Open **Voiceover**. Use captions as the narration, write a separate script, or upload an audio recording. Generate speech with ElevenLabs using a voice ID accessible to your account. Narration is one continuous track. Match its length by adjusting scene durations; export refuses to truncate a longer narration.
5. Choose the aspect ratio and preview the scenes. Open **Export**, set the title and captions, then **Render video**. Keep the tab visible while rendering. Download the real video, caption file, narration script, and project JSON as needed.

The example uses existing Power Genie solar imagery and can be rendered without any keys. It is labeled as an example. Still images receive a slow zoom in the exported video; clips retain their motion and loop when a scene is longer than the source. Original clip audio is muted; attach a narration track for audio output.

## Accounts and recoverability

AI generation uses your accounts' credits. Entering a key does not verify it; the app identifies it as entered until a provider request succeeds. Provider errors appear with recovery instructions. No live paid provider calls were made during development because the user supplied no API keys.

PiAPI task IDs are saved immediately with the project. If you stop polling, reload, or encounter a timeout, re-enter the PiAPI key and select **Resume task**. Stopping the app's polling does not cancel a submitted billable generation at the provider. A failed task can be retried explicitly. Network failure before receiving an ID requires checking provider task history before resubmitting.

Projects are autosaved as metadata in local browser storage. API keys, uploaded files, generated narration, and completed video blobs are not stored there. **Save project** exports JSON containing captions, prompts, dimensions, public media URLs, and pending task IDs. Reattach local files and narration after reopening. Provider media URLs may expire; download and re-upload media to keep a local copy. If a provider's media lacks CORS permission, download it from the provider and upload it here before rendering.

## Output and limits

- Chrome and Edge typically produce VP9/Opus WebM; the exporter falls back to other supported browser encoders, including MP4 where supported. This is local browser composition, not a Creatomate integration. WebM may omit seek-duration metadata depending on the browser; it remains playable.
- Output dimensions: portrait 720 × 1280, landscape 1280 × 720, square 960 × 960; up to twelve scenes, 3–10 seconds each. Kling generations are five seconds regardless of the scene's display duration.
- Long on-screen captions are wrapped and limited to six lines in the final render. Keep captions short for social video.
- The page provides manual downloads. Google Sheets input, scheduled daily runs, Drive upload, Discord notifications, Creatomate cloud MP4 rendering, and social-network publishing from the reference are not implemented.
- The existing Celebrity Solar, Hip-Hop Solar, and Gas-Genie pages, dashboards, and navigation remain separate.

## Validation

Run `npm run lint`, `npm run build`, and `npm test`. For the browser smoke test, start the development server on port 3016 and run `node scripts/video-studio-smoke.mjs`. It verifies a real 15-second video export and playback, desktop/mobile layout, scene editing, narration editing, key non-persistence, local storyboard creation, and validation. Provider adapters are exercised with mocked network responses in `tests/video-studio.test.ts`.

Implementation references: [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create), [PiAPI Flux](https://piapi.ai/docs/flux-api/text-to-image), [PiAPI Kling](https://piapi.ai/docs/kling-api/create-task), [ElevenLabs speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
