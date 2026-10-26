# Sign dataset workflow

SignBridge has two distinct vocabularies:

- **Interviewer → candidate playback:** bundled image sequences or signer-recorded videos.
- **Candidate → interviewer recognition:** calibrated MediaPipe landmark templates. Importing playback frames does not automatically make dynamic signs recognizable from a new signer.

## Current bundled library

The imported everyday-ISL archive contributes 44 labels with 40 frames per label. The build contains compressed WebP frames and a generated manifest, not the original 336 MB archive.

The alphabet archive contributes 35 representative `A–Z` and `1–9` signs. SignBridge uses them as an immediate fingerspelling fallback so every detected question has a visual path while Gemma selects any better phrase or word clips.

MediaPipe successfully produced built-in candidate-recognition templates for 32 of those signs. The representative `H`, `Q`, and `S` images did not yield hand landmarks and are therefore playback-only until better samples are imported or the signs are calibrated manually.

The dataset did not include license metadata. Keep the assets local to the hackathon until reuse and redistribution permission is confirmed. The labels and sign accuracy must also be reviewed by a knowledgeable ISL signer.

## Add or replace vocabulary

Arrange an archive like this:

```text
dataset.zip
  introduce-yourself/
    1.png
    2.png
  technical-skills/
    1.png
    2.png
```

Then run:

```powershell
npm run import:signs -- "C:\path\to\dataset.zip"
npm run build
```

For an alphanumeric dataset organized as `A/image.jpg`, `B/image.jpg`, and so on:

```powershell
npm run import:fingerspelling -- "C:\path\to\alphabet-dataset.zip"
npm run build
npm run build:fingerspelling-templates
npm run build
```

The importer:

1. discovers every labeled image-sequence folder;
2. orders numerically named frames;
3. resizes each frame to 384×288;
4. converts it to compact WebP;
5. generates `assets/signs/library.json`; and
6. makes every label available to Gemma 4 as a constrained choice.

Re-importing replaces the bundled library. Preserve desired labels in the new dataset. Signer-recorded custom phrase videos are stored separately in IndexedDB and take priority over bundled clips.

For the interview demo, prioritize complete recordings for introduction, experience, project, technical skills, and teamwork questions. Complete phrase clips are more accurate than concatenating isolated words.
