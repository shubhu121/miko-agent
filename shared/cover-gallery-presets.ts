export interface CoverGalleryPreset {
  id: string;
  title: string;
  fileName: string;
  category?: string;
}

export const COVER_GALLERY_PRESETS: readonly CoverGalleryPreset[] = Object.freeze([
  {
    id: "scribble-black-cat",
    title: "This feature is available in English only.",
    fileName: "scribble-black-cat.jpg",
    category: "default",
  },
  {
    id: "blue-island-watercolor",
    title: "This feature is available in English only.",
    fileName: "blue-island-watercolor.jpg",
    category: "default",
  },
  {
    id: "nature-plate-print",
    title: "This feature is available in English only.",
    fileName: "nature-plate-print.jpg",
    category: "default",
  },
  {
    id: "pastel-spring-bookmark",
    title: "This feature is available in English only.",
    fileName: "pastel-spring-bookmark.jpg",
    category: "default",
  },
  {
    id: "hidden-ragdoll-cat",
    title: "This feature is available in English only.",
    fileName: "hidden-ragdoll-cat.jpg",
    category: "default",
  },
  {
    id: "grass-horizon-dream",
    title: "This feature is available in English only.",
    fileName: "grass-horizon-dream.jpg",
    category: "default",
  },
  {
    id: "bamboo-shadow-minimal",
    title: "This feature is available in English only.",
    fileName: "bamboo-shadow-minimal.jpg",
    category: "default",
  },
  {
    id: "green-plain-clouds",
    title: "This feature is available in English only.",
    fileName: "green-plain-clouds.jpg",
    category: "default",
  },
  {
    id: "four-seasons-storybook",
    title: "This feature is available in English only.",
    fileName: "four-seasons-storybook.jpg",
    category: "default",
  },
  {
    id: "pink-flower-fisherman",
    title: "This feature is available in English only.",
    fileName: "pink-flower-fisherman.jpg",
    category: "default",
  },
  {
    id: "sunlit-window-leaves",
    title: "This feature is available in English only.",
    fileName: "sunlit-window-leaves.jpg",
    category: "default",
  },
  {
    id: "summer-sea-fantasy",
    title: "This feature is available in English only.",
    fileName: "summer-sea-fantasy.jpg",
    category: "default",
  },
  {
    id: "maximalist-four-seasons",
    title: "This feature is available in English only.",
    fileName: "maximalist-four-seasons.jpg",
    category: "default",
  },
  {
    id: "story-garden-objects",
    title: "This feature is available in English only.",
    fileName: "story-garden-objects.jpg",
    category: "default",
  },
  {
    id: "blue-sky-screenprint",
    title: "This feature is available in English only.",
    fileName: "blue-sky-screenprint.jpg",
    category: "default",
  },
  {
    id: "indigo-window-silhouette",
    title: "This feature is available in English only.",
    fileName: "indigo-window-silhouette.jpg",
    category: "default",
  },
  {
    id: "spring-gauze-room",
    title: "This feature is available in English only.",
    fileName: "spring-gauze-room.jpg",
    category: "default",
  },
  {
    id: "felt-blue-storybook",
    title: "This feature is available in English only.",
    fileName: "felt-blue-storybook.jpg",
    category: "default",
  },
  {
    id: "rainy-street-cafe",
    title: "This feature is available in English only.",
    fileName: "rainy-street-cafe.jpg",
    category: "default",
  },
  {
    id: "dragon-pillar-palace",
    title: "This feature is available in English only.",
    fileName: "dragon-pillar-palace.jpg",
    category: "default",
  },
  {
    id: "wasteland-rider",
    title: "This feature is available in English only.",
    fileName: "wasteland-rider.jpg",
    category: "default",
  },
  {
    id: "white-cat-blossom",
    title: "This feature is available in English only.",
    fileName: "white-cat-blossom.jpg",
    category: "default",
  },
  {
    id: "tree-lined-path",
    title: "This feature is available in English only.",
    fileName: "tree-lined-path.jpg",
    category: "default",
  },
  {
    id: "ochre-silhouette",
    title: "This feature is available in English only.",
    fileName: "ochre-silhouette.jpg",
    category: "default",
  },
  {
    id: "misty-blossoms",
    title: "This feature is available in English only.",
    fileName: "misty-blossoms.jpg",
    category: "default",
  },
].map((item) => Object.freeze(item)));

const COVER_GALLERY_PRESET_BY_ID = new Map(COVER_GALLERY_PRESETS.map((preset) => [preset.id, preset]));

export function getCoverGalleryPreset(presetId: unknown): CoverGalleryPreset | null {
  if (typeof presetId !== "string" || !presetId.trim()) return null;
  return COVER_GALLERY_PRESET_BY_ID.get(presetId.trim()) || null;
}

export function listCoverGalleryPresets() {
  return COVER_GALLERY_PRESETS;
}
