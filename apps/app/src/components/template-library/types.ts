export type ReferenceKind = "page" | "component";

export interface UIReference {
  id: string;
  name: string;
  description: string;
  html: string;
  data_description: string;
  kind?: ReferenceKind;
  created_at?: string;
  component_type?: string;
  component_data?: Record<string, unknown>;
  version: number;
  preview_width?: number;
  preview_height?: number;
  reference_order?: number;
  asset_paths?: string[];
}

// Compatibility for references saved before the two libraries were separated.
export function referenceKind(item: Pick<UIReference, "id" | "kind" | "component_type">): ReferenceKind {
  if (item.kind) return item.kind;
  if (item.component_type || ["seed-weather-001", "seed-invoice-001"].includes(item.id)) return "component";
  return "page";
}

export const libraryLabels: Record<ReferenceKind, string> = { page: "模板库", component: "组件库" };

/** Hydrate saved built-ins in place so selecting one never changes gallery order. */
export function mergeReferences(seeds: UIReference[], saved: UIReference[]): UIReference[] {
  const savedById = new Map(saved.map((item) => [item.id, item]));
  const seedIds = new Set(seeds.map((item) => item.id));
  return [
    ...seeds.map((seed) => ({ ...seed, ...savedById.get(seed.id) })),
    ...saved.filter((item) => !seedIds.has(item.id)),
  ];
}
