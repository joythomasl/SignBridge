# Sign dataset workflow

SignBridge has two distinct vocabularies:

- **Interviewer → candidate playback:** a generated avatar driven by landmark sequences, or signer-recorded verified videos.
- **Candidate → interviewer recognition:** a trained static alphabet classifier, temporal word templates, and optional user calibrations. Importing playback frames alone does not retrain recognition.

## Current bundled library

The imported everyday-ISL archive contributes 44 labels with 40 frames per label. Those images are used during template generation, producing 12-keyframe temporal landmark sequences. Runtime animation and recognition both use the resulting points; source photographs are not copied into `dist`.

The alphabet archive contributes 35 `A–Z` and `1–9` signs. Thousands of images train candidate-side recognition; class-centroid landmark poses drive the generated fingerspelling avatar.

The bundled classifier was trained from 4,120 detected landmark samples across all 35 labels. Each hand is translated and scaled relative to its wrist while preserving wrist/palm orientation; left-handed observations are mirrored into the same canonical space. The `134 → 128 → 64 → 35` MLP also keeps hand-presence and two-hand positional features. A held-out split from the same archive reached 99.89% accuracy: `G` recall was 96.3% and every other class reached 100%. Confidence, class-margin, and centroid-distance thresholds reject uncertain poses as **unknown sign**.

This validation split shares the source dataset and signer conditions with training, so it is a pipeline check rather than proof of signer-independent accuracy. For a stronger evaluation, collect a separate signer/camera test set and keep it entirely out of training.

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
npm run extract:alphabet-features -- "C:\path\to\alphabet-dataset.zip" 120
npm run train:alphabet
npm run build
```

The optional final number is the maximum sampled images per class. Landmark samples are written under ignored `artifacts/`; only the compact trained model in `assets/signs/alphabet-model.json` is bundled.

The importer:

1. discovers every labeled image-sequence folder;
2. orders numerically named frames;
3. resizes each frame to 384×288;
4. converts it to compact WebP;
5. generates `assets/signs/library.json`; and
6. makes every label available to Gemma 4 as a constrained choice.

Re-importing replaces the bundled library. Preserve desired labels in the new dataset. Signer-recorded custom phrase videos are stored separately in IndexedDB and take priority over bundled clips.

For the interview demo, prioritize complete recordings for introduction, experience, project, technical skills, and teamwork questions. Complete phrase clips are more accurate than concatenating isolated words.

After replacing the word dataset, regenerate temporal recognition templates:

```powershell
npm run build
npm run build:word-templates
npm run build
```

The runtime compares a rolling 1.2–4 second landmark history against each word using dynamic time warping plus an expected-motion check. For a word that does not generalize, use **Recognition setup and fallback** to record a personal motion template; it is saved in local Chrome storage and takes priority over the bundled motion. This is suitable for a hackathon demonstration, but a single supplied sequence per label is still insufficient for production-grade signer-independent recognition.
