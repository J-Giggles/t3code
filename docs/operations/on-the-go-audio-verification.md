# On-the-Go Audio Verification

Use this gate when Electron voice capture, transcription models, audio routing, or the On-the-Go RPC changes. It supplements deterministic unit tests with real audio through a virtual microphone; it does not replace physical Mac microphone and headset checks.

## Prepare A Spoken Fixture

On the Mac, generate the canonical activation phrase:

```bash
/usr/bin/say -o /tmp/t3code-hey-theo.aiff "Hey Theo"
scp /tmp/t3code-hey-theo.aiff giggabit-server:/tmp/t3code-hey-theo.aiff
```

The fixture contains no user audio and may be regenerated at any time.

## Run The Real Audio Gate

On `giggabit-server`, from the feature or Staging worktree:

```bash
T3CODE_ON_THE_GO_AUDIO_FIXTURE=/tmp/t3code-hey-theo.aiff \
T3CODE_ON_THE_GO_WHISPER_MODEL="$HOME/.local/share/pywhispercpp/models/ggml-base.en.bin" \
T3CODE_ON_THE_GO_WHISPER_CLI="$HOME/.local/bin/whisper-cli" \
pnpm run test:on-the-go:e2e:headed -- --grep @audio --reporter=line
```

The test records the current default PipeWire source, creates a transient null sink and remapped microphone, makes that source the default before enabling On-the-Go, plays the fixture, and requires the Voice Dock to enter Theo conversation. Cleanup restores the previous source and unloads both transient modules even when the assertion fails.

## Deterministic Coverage

- `apps/web/src/localTopics/onTheGo/PcmSpeechRecognition.test.ts` covers speech/silence segmentation, minimum utterance refusal, downsampling, and bounded emission.
- `apps/server/src/localTopics/onTheGo/PcmTranscription.test.ts` covers validated PCM delivery, transcript trimming, unavailable models, oversized input, and no-run refusal invariants.
- `apps/web/src/localTopics/onTheGo/BrowserSpeechAdapter.test.ts` covers model selection and runtime recognition failure reporting.
- `packages/client-runtime/src/localTopics/onTheGo/Controller.test.ts` covers fail-closed mode shutdown and visible failure state.

## Failure Triage

If raw capture is silent, inspect `pactl get-default-source`, `pactl list short sources`, and Electron microphone permission. If raw capture works but transcription fails, run the fixture directly through the configured CLI and model. A browser recognizer `network` error is not a microphone success; Electron must use the PCM RPC path. Never leave a transient `t3code_voice_test` module or changed default source behind after manual diagnosis.

## Recorded Command Audit

On 2026-07-14, Mac `say` rendered 30 concrete phrases from `ON_THE_GO_VOICE_PARITY_CATALOG`; `giggabit-server` transcribed every fixture with `ggml-base.en.bin`. Twenty-eight normalized directly. The two low-risk read-command variants were `What changed in the follow chat?` for “followed chat” and `Inspect the OData.` for “Theo data”; both are covered by narrow aliases in `normalizeRecognizedVoicePhrase` and `OTG-UT-005/021`. The immutable safety phrases Stop, Cancel, Confirm, and Send it all transcribed directly and did not receive fuzzy aliases. After the two bounded aliases, the catalog audit resolves 30 of 30 fixtures to their intended command family.
