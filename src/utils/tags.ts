import * as SecureStore from "expo-secure-store";
import { Tag } from "../types";

const TAGS_KEY = "bucks_tags";

const DEFAULT_TAGS: Tag[] = [
  { id: "default-salud", label: "Salud", color: "#FF6B6B" },
  { id: "default-comida", label: "Comida", color: "#FF8E53" },
  { id: "default-viaje", label: "Viaje", color: "#4D96FF" },
  { id: "default-transporte", label: "Transporte", color: "#FFD93D" },
  { id: "default-ocio", label: "Ocio", color: "#9B59B6" },
  { id: "default-educacion", label: "Educación", color: "#6BCB77" },
];

function normalizeTags(tags: Tag[]): Tag[] {
  const byLabel = new Map<string, Tag>();
  [...DEFAULT_TAGS, ...tags].forEach((tag) => {
    const label = tag.label.trim();
    if (label) byLabel.set(label.toLowerCase(), { ...tag, label });
  });
  return Array.from(byLabel.values());
}

export async function loadTags(): Promise<Tag[]> {
  try {
    const raw = await SecureStore.getItemAsync(TAGS_KEY);
    const tags = normalizeTags(raw ? JSON.parse(raw) : []);
    await saveTags(tags);
    return tags;
  } catch { return normalizeTags([]); }
}

async function saveTags(tags: Tag[]): Promise<void> {
  await SecureStore.setItemAsync(TAGS_KEY, JSON.stringify(tags));
}

export async function addTag(tag: Tag): Promise<Tag[]> {
  const tags = normalizeTags([...(await loadTags()), tag]);
  await saveTags(tags);
  return tags;
}

export async function updateTag(updated: Tag): Promise<Tag[]> {
  const tags = await loadTags();
  const idx = tags.findIndex((t) => t.id === updated.id);
  if (idx >= 0) tags[idx] = updated;
  const normalized = normalizeTags(tags);
  await saveTags(normalized);
  return normalized;
}

export async function deleteTag(id: string): Promise<Tag[]> {
  const tags = await loadTags();
  const filtered = tags.filter((t) => t.id !== id);
  await saveTags(filtered);
  return filtered;
}

export function abbreviateTag(label: string): string {
  if (label.length <= 6) return label;
  return label.slice(0, 5) + ".";
}

export function tagTextColor(color: string): string {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return "#fff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#18202d" : "#fff";
}
