$ErrorActionPreference = "Stop"

$env:OLLAMA_ORIGINS = "chrome-extension://*"

Write-Host "Starting Ollama for the SignBridge hackathon demo..."
Write-Host "Allowed browser origin: $env:OLLAMA_ORIGINS"
Write-Host "Keep this window open while SignBridge is running."

ollama serve
