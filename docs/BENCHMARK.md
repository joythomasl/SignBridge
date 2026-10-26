# Local Gemma 4 benchmark

**Date:** 26 October 2026  
**Model:** `gemma4:e2b-it-q4_K_M` (`b37049369adf`, 4.6 GB)  
**Ollama:** 0.40.11  
**Machine:** AMD Ryzen 5 8645HS, NVIDIA RTX 3050 Laptop GPU, 15.2 GB system RAM  
**Request settings:** text-only, `think: false`, JSON schema output, `num_predict: 96`, `temperature: 0.2`, `keep_alive: 30m`

## Measured results

| Request | State | Wall time |
|---|---|---:|
| Candidate glosses → English answer | Cold model load | 95.66 s |
| Interviewer question → ISL intent | Warm | 1.60 s |
| Candidate glosses → English answer | Warm repeat | 1.39 s |
| Interviewer question → ISL intent | Warm repeat | 1.28 s |

## End-to-end browser verification

The unpacked Manifest V3 extension was loaded in a fresh Chromium profile and exercised on a Google Meet join page. It successfully:

- mounted the SignBridge HUD;
- reached the local Gemma 4 model from its extension origin;
- mapped “Please explain a project you worked on.” to `ASK_PROJECT`;
- converted `ME PYTHON AI PROJECT THREE YEAR` to “I worked on an AI project for three years.”; and
- stopped at the mandatory candidate-review step.

The automated run is available through `npm run smoke:browser`; its screenshot is written to `artifacts/browser-smoke.png`.

The generated candidate response preserved the supplied meaning:

> I have three years of experience with Python and AI projects.

The reverse test correctly selected `ASK_PROJECT` for “Please explain a project you worked on.”

## Demo requirement

Preload Gemma 4 before judges arrive and retain the 30-minute keep-alive. A cold request is not usable in conversation on this machine; the warm path is suitable for the hackathon demo.
