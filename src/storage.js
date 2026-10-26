import { DEFAULT_SETTINGS } from "./constants.js";

export async function getSettings() {
  const result = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
}

export async function saveSettings(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  await chrome.storage.local.set({ settings: merged });
  return merged;
}

export async function getTemplates() {
  const result = await chrome.storage.local.get("gestureTemplates");
  return result.gestureTemplates || {};
}

export async function saveTemplate(gloss, vector) {
  const templates = await getTemplates();
  templates[gloss] = {
    vector,
    updatedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ gestureTemplates: templates });
  return templates;
}

export async function getSequenceTemplates() {
  const result = await chrome.storage.local.get("gestureSequenceTemplates");
  return result.gestureSequenceTemplates || {};
}

export async function saveSequenceTemplate(gloss, sequence, motion) {
  const templates = await getSequenceTemplates();
  templates[gloss] = {
    sequence,
    motion,
    source: "personal-motion-training",
    updatedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ gestureSequenceTemplates: templates });
  return templates;
}

export async function deleteTemplate(gloss) {
  const templates = await getTemplates();
  delete templates[gloss];
  await chrome.storage.local.set({ gestureTemplates: templates });
  return templates;
}
