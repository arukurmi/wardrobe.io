export type Category =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'outerwear'
  | 'footwear'
  | 'bag'
  | 'hat'
  | 'accessory';

export const CATEGORIES: Category[] = [
  'top',
  'bottom',
  'dress',
  'outerwear',
  'footwear',
  'bag',
  'hat',
  'accessory',
];

export type Piece = {
  id: string;
  photoId: string;
  garmentId: string;
  category: Category;
  bbox: number[];
  cropUrl: string;
};

export type Garment = {
  id: string;
  name: string;
  category: Category;
  brand: string | null;
  color: string | null;
  priceCents: number | null;
  coverUrl: string | null;
  wearCount: number;
};

export type GarmentDetail = Garment & {
  pieces: (Piece & { photo: Photo })[];
  mergeHistory: MergeEvent[];
};

export type Photo = {
  id: string;
  filename: string;
  uploaded_at: string;
  pieces?: Piece[];
};

export type MergeEvent = {
  id: string;
  source_garment_id: string;
  target_garment_id: string;
  created_at: string;
  undone_at: string | null;
};

export type Suggestion = {
  id: string;
  similarity: number;
  piece: Piece;
  pieceGarment: { id: string; name: string } | null;
  garment: { id: string; name: string; coverUrl: string | null };
};

export type Stats = {
  totalGarments: number;
  totalPhotos: number;
  totalValueCents: number;
  byCategory: { category: string; count: number }[];
  mostWorn: { garmentId: string; name: string; wearCount: number }[];
  costPerWear: { garmentId: string; name: string; cpwCents: number }[];
};

export type IngestResult = {
  photoId: string;
  pieces: {
    pieceId: string;
    garmentId: string;
    decision: 'attached' | 'new' | 'new+suggested';
    suggestionId?: string;
    similarity?: number;
  }[];
};

export type GarmentPatch = Partial<{
  display_name: string;
  brand: string | null;
  color: string | null;
  price_cents: number | null;
  category: Category;
  cover_piece_id: string | null;
}>;
