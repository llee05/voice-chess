# Synthetic speech fixtures

Generated with eSpeak NG 1.52.0, voice `en-us`, then converted by FFmpeg to mono
16 kHz signed 16-bit PCM WAV. These contain no user recording. The clips are synthesized from the short text below using the default formant
voice, without sampled speech or copied program code. See [eSpeak's license](https://espeak.sourceforge.net/license.html) for the synthesizer
and its output provision (section 2). The synthesizer is not shipped with the extension or needed to run tests.

| File | Synthesis text | Words/minute |
| --- | --- | --- |
| `knight-e-six.wav` | `knight e six` | 240 |
| `knight-takes-g-five.wav` | `knight takes g five` | 230 |
| `queen-h-seven.wav` | `queen h seven` | 225 |
| `knight-f-three.wav` | `knight f three` | 220 |
| `a-eight-knight.wav` | `A, eight knight` | 210 |
| `d-e.wav` | `D, E` | 180 |
| `stop.wav` | `stop` | 180 |
| `stop-listening.wav` | `stop listening` | 180 |
| `unrelated.wav` | `good morning everyone` | 180 |

The bare synthetic “stop” can be rejected as unknown; the test follows it with
“stop listening” when necessary. Both must leave the chess position untouched.
The commas make eSpeak pronounce the file letters distinctly. The test supplies
leading silence and endpoint silence; it does not force-finalize partial text.
These clips test decoder integration under a fixed synthetic voice, not human
accent coverage or recognition accuracy. The native-capture check loops the
knight clip with silence through Chromium's fake microphone device.

To regenerate one clip with installed development tools:

```sh
espeak-ng -v en-us -s 240 -w /tmp/voice-chess-knight.wav 'knight e six'
ffmpeg -i /tmp/voice-chess-knight.wav -ar 16000 -ac 1 knight-e-six.wav
```
