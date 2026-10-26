import json
import sys
from pathlib import Path

import numpy as np
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "artifacts" / "alphabet-features.json"
OUTPUT = ROOT / "assets" / "signs" / "alphabet-model.json"

payload = json.loads(INPUT.read_text(encoding="utf-8"))
X = np.asarray([sample["vector"] for sample in payload["samples"]], dtype=np.float64)
y = np.asarray([sample["label"] for sample in payload["samples"]])
if len(np.unique(y)) < 2:
    raise RuntimeError("Training needs at least two detected classes")

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.22, random_state=42, stratify=y
)
scaler = StandardScaler().fit(X_train)
X_train_scaled = scaler.transform(X_train)
classifier = MLPClassifier(
    hidden_layer_sizes=(128, 64),
    activation="relu",
    solver="adam",
    alpha=0.0005,
    batch_size=128,
    learning_rate_init=0.001,
    max_iter=350,
    early_stopping=False,
    random_state=42
).fit(X_train_scaled, y_train)

probabilities = classifier.predict_proba(scaler.transform(X_test))
predictions = classifier.classes_[np.argmax(probabilities, axis=1)]
accuracy = float(accuracy_score(y_test, predictions))
report = classification_report(y_test, predictions, output_dict=True, zero_division=0)
confidence = np.max(probabilities, axis=1)
sorted_probabilities = np.sort(probabilities, axis=1)
margins = sorted_probabilities[:, -1] - sorted_probabilities[:, -2]
centroids = []
distance_thresholds = []
for label in classifier.classes_:
    class_samples = X_train_scaled[y_train == label]
    centroid = np.mean(class_samples, axis=0)
    distances = np.sqrt(np.mean(np.square(class_samples - centroid), axis=1))
    centroids.append(centroid.tolist())
    distance_thresholds.append(float(np.quantile(distances, 0.995) * 1.35 + 1e-6))

model = {
    "version": 2,
    "type": "mlp-landmark-classifier",
    "featureCount": int(X.shape[1]),
    "classes": classifier.classes_.tolist(),
    "mean": scaler.mean_.tolist(),
    "scale": scaler.scale_.tolist(),
    "weights": [layer.tolist() for layer in classifier.coefs_],
    "biases": [layer.tolist() for layer in classifier.intercepts_],
    "centroids": centroids,
    "distanceThresholds": distance_thresholds,
    "confidenceThreshold": 0.58,
    "marginThreshold": 0.12,
    "training": {
        "samples": int(len(X)),
        "trainSamples": int(len(X_train)),
        "validationSamples": int(len(X_test)),
        "validationAccuracy": accuracy,
        "medianValidationConfidence": float(np.median(confidence)),
        "medianValidationMargin": float(np.median(margins)),
        "perClassRecall": {label: float(report[label]["recall"]) for label in classifier.classes_}
    }
}
OUTPUT.write_text(json.dumps(model, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"Validation accuracy: {accuracy:.3%} ({len(X_test)} images)")
print(f"Saved {len(classifier.classes_)} classes and {X.shape[1]} features to {OUTPUT}")
