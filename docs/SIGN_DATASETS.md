# Sign dataset workflow

SignBridge has two distinct vocabularies:

- **Interviewer → candidate playback:** bundled image sequences or signer-recorded videos.
- **Candidate → interviewer recognition:** a trained static alphabet classifier, temporal word templates, and optional user calibrations. Importing playback frames alone does not retrain recognition.

## Current bundled library

The imported everyday-ISL archive contributes 44 labels with 40 frames per label. Those sequences now serve both animation playback and a 12-keyframe temporal landmark recognizer. The build contains compressed WebP frames and generated templates, not the original 336 MB archive.

The alphabet archive contributes 35 `A–Z` and `1–9` signs. SignBridge uses representative frames for playback and thousands of images for candidate-side recognition.

The bundled classifier was trained from 4,120 detected landmark samples across all 35 labels. Each hand is translated and scaled relative to its wrist while preserving wrist/palm orientation; left-handed observations are mirrored into the same canonical space. The model also keeps hand-presence and two-hand positional features. A held-out split from the same archive reached 99.78% accuracy, with 96.0% recall for `O`, 96.3% for `G`, and 100% for the remaining classes. Confidence and class-margin thresholds reject uncertain poses as **unknown sign**.

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

The runtime compares a rolling 1.2–4 second landmark window against each sequence at multiple speeds. This is suitable for a hackathon demonstration, but a single recorded sequence per label is insufficient for production-grade signer-independent recognition.
