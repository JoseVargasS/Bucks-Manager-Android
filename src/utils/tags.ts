import * as SecureStore from "expo-secure-store";
import type { LanguageMode, Tag, Transaction } from "../types";
import { dark } from "../theme/colors";
import { logError } from "./errorHandler";

const TAGS_KEY = "bucks_tags";

const DEFAULT_TAGS = [
  { id: "default-salud", es: "Salud", en: "Health", color: dark.tagColors[0] },
  { id: "default-comida", es: "Comida", en: "Food", color: dark.tagColors[1] },
  { id: "default-viaje", es: "Viaje", en: "Travel", color: dark.tagColors[4] },
  { id: "default-transporte", es: "Transporte", en: "Transport", color: dark.tagColors[2] },
  { id: "default-ocio", es: "Ocio", en: "Leisure", color: dark.tagColors[5] },
  { id: "default-educacion", es: "Educación", en: "Education", color: dark.tagColors[3] },
];

const DEFAULT_TAG_IDS = new Set(DEFAULT_TAGS.map((tag) => tag.id));

export function slugifyTagLabel(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `custom-${slug}`;
}

function getDefaultTags(language: LanguageMode): Tag[] {
  return DEFAULT_TAGS.map((tag) => ({
    id: tag.id,
    label: tag[language],
    color: tag.color,
  }));
}

function normalizeTags(tags: Tag[], language: LanguageMode): Tag[] {
  const byLabel = new Map<string, Tag>();
  const otherDefaultLabels = new Set(
    DEFAULT_TAGS.map((tag) => tag[language === "en" ? "es" : "en"].toLowerCase()),
  );
  getDefaultTags(language).forEach((tag) => byLabel.set(tag.label.toLowerCase(), tag));
  tags.forEach((tag) => {
    const label = tag.label.trim();
    if (!label || DEFAULT_TAG_IDS.has(tag.id) || otherDefaultLabels.has(label.toLowerCase())) return;
    byLabel.set(label.toLowerCase(), { ...tag, label });
  });
  return Array.from(byLabel.values());
}

export async function loadTags(language: LanguageMode = "es"): Promise<Tag[]> {
  try {
    const raw = await SecureStore.getItemAsync(TAGS_KEY);
    const tags = normalizeTags(raw ? JSON.parse(raw) : [], language);
    await saveTags(tags);
    return tags;
  } catch (e) {
    logError(e, "tags:loadTags");
    return normalizeTags([], language);
  }
}

export async function saveTags(tags: Tag[]): Promise<void> {
  await SecureStore.setItemAsync(TAGS_KEY, JSON.stringify(tags));
}

export function abbreviateTag(label: string): string {
  if (label.length <= 6) return label;
  return label.slice(0, 5) + ".";
}

export function tagTextColor(color: string): string {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return dark.tagTextLight;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150
    ? dark.tagTextDark
    : dark.tagTextLight;
}

export function findTagById(id: string, tagsList: Tag[]): Tag | undefined {
  return tagsList.find((tag) => tag.id === id);
}

export function labelForTagId(id: string, tagsList: Tag[]): string {
  return findTagById(id, tagsList)?.label ?? id;
}

export function migrateTagReferences(
  refs: string[],
  tagsList: Tag[],
): string[] {
  if (!refs?.length) return refs ?? [];
  if (!tagsList.length) return [...refs];
  const byId = new Map(tagsList.map((tag) => [tag.id, tag]));
  const byLabel = new Map<string, Tag>();
  tagsList.forEach((tag) => byLabel.set(tag.label.trim().toLowerCase(), tag));
  DEFAULT_TAGS.forEach((defaultTag) => {
    const existing = byId.get(defaultTag.id);
    const fallbackLabel = existing?.label ?? defaultTag.es;
    const fallbackColor = existing?.color ?? defaultTag.color;
    byLabel.set(defaultTag.es.toLowerCase(), { id: defaultTag.id, label: fallbackLabel, color: fallbackColor });
    byLabel.set(defaultTag.en.toLowerCase(), { id: defaultTag.id, label: fallbackLabel, color: fallbackColor });
  });
  const seen = new Set<string>();
  const migrated: string[] = [];
  refs.forEach((ref) => {
    if (!ref) return;
    const exactById = byId.get(ref);
    if (exactById) {
      if (!seen.has(exactById.id)) {
        seen.add(exactById.id);
        migrated.push(exactById.id);
      }
      return;
    }
    const byLowerLabel = byLabel.get(ref.trim().toLowerCase());
    if (byLowerLabel) {
      if (!seen.has(byLowerLabel.id)) {
        seen.add(byLowerLabel.id);
        migrated.push(byLowerLabel.id);
      }
      return;
    }
    const orphanId = slugifyTagLabel(ref);
    if (!seen.has(orphanId)) {
      seen.add(orphanId);
      migrated.push(orphanId);
    }
  });
  return migrated;
}

export function migrateTransactionTags(transactions: Transaction[], tagsList: Tag[]): Transaction[] {
  if (!transactions.length || !tagsList.length) return transactions;
  let changed = false;
  const next = transactions.map((tx) => {
    if (!tx.tags?.length) return tx;
    const migrated = migrateTagReferences(tx.tags, tagsList);
    const isSame =
      migrated.length === tx.tags.length
      && migrated.every((id, index) => id === tx.tags![index]);
    if (isSame) return tx;
    changed = true;
    return { ...tx, tags: migrated };
  });
  return changed ? next : transactions;
}
