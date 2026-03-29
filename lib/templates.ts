const STORAGE_KEY = "wa_bulk_templates";

export interface Template {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "default-1",
    name: "Inquiry",
    content:
      "Hello! 👋 \n\nI hope this message finds you well.\n\nThis is to check with you regarding your inquiry for property in Dubai.\nHave you found a suitable option or are you still looking?\nFeel free to reach out anytime.\n\nIn anticipation,\nRegards.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "default-2",
    name: "Targeted",
    content:
      "Hello! 👋 \n\nI hope this message finds you well and safe. \n\nThis is to inquire about your property in *Avelon Boulevard - Arjan*, is it available for sale or rent?\n\nI'm working with buyers and investors who are actively looking for their next purchase, and I would love to introduce your property to them.\n\nIn anticipatioon,\nRegards.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "default-3",
    name: "Undefined",
    content:
      "Hello! 👋 \n\nI hope you're safe and sound. \n\nI'm reaching out to kindly check if your property in Dubai is available for sale or rent. \n\nIf so, please let me know — and if there's anything I can assist you with, feel free to ask. \n\nLooking forward to hearing from you. \nRegards.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function load(): Template[] {
  if (typeof window === "undefined") return DEFAULT_TEMPLATES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TEMPLATES;
    const parsed = JSON.parse(raw) as Template[];
    return parsed.length > 0 ? parsed : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

function save(templates: Template[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function getTemplates(): Template[] {
  return load();
}

export function createTemplate(name: string, content: string): Template {
  const templates = load();
  const now = new Date().toISOString();
  const template: Template = {
    id: `tpl-${Date.now()}`,
    name,
    content,
    createdAt: now,
    updatedAt: now,
  };
  save([...templates, template]);
  return template;
}

export function updateTemplate(
  id: string,
  updates: Partial<Pick<Template, "name" | "content">>
): Template | null {
  const templates = load();
  const idx = templates.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const updated: Template = {
    ...templates[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  templates[idx] = updated;
  save(templates);
  return updated;
}

export function deleteTemplate(id: string): void {
  const templates = load().filter((t) => t.id !== id);
  save(templates);
}
