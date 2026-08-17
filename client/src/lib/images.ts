/** The image MIME types the app accepts for upload. Kept in one place so
 * the drag-and-drop filter and the <input accept> attribute never drift. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];

/** Value for an <input type="file" accept="…"> attribute. */
export const ACCEPT_ATTR = ACCEPTED_IMAGE_TYPES.join(',');

/** Whether a File/Blob MIME type is one we accept. */
export function isAcceptedImage(type: string): boolean {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}
