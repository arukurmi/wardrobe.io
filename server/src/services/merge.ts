import type { Db } from '../db.js';
import { newId } from '../lib/ids.js';
import { getGarment } from '../repo/garments.js';
import { piecesForGarment, getPiece } from '../repo/pieces.js';
import { getSuggestion, setStatus } from '../repo/suggestions.js';

export class MergeError extends Error {
  status = 409;
}

/**
 * Merge source garment into target: re-point source's pieces, mark source
 * merged, log the event with the exact piece ids moved (for undo).
 */
export function mergeGarments(
  db: Db,
  sourceId: string,
  targetId: string
): { mergeEventId: string } {
  return db.transaction(() => {
    if (sourceId === targetId) throw new MergeError('cannot merge a garment into itself');
    const source = getGarment(db, sourceId);
    const target = getGarment(db, targetId);
    if (!source || !target) throw new MergeError('garment not found');
    if (source.merged_into) throw new MergeError('source already merged');
    if (target.merged_into) throw new MergeError('target already merged');

    const movedIds = piecesForGarment(db, sourceId).map((p) => p.id);
    db.prepare('update pieces set garment_id = ? where garment_id = ?').run(
      targetId,
      sourceId
    );
    db.prepare('update garments set merged_into = ? where id = ?').run(
      targetId,
      sourceId
    );
    const mergeEventId = newId();
    db.prepare(
      `insert into merge_events (id, source_garment_id, target_garment_id, piece_ids_json)
       values (?, ?, ?, ?)`
    ).run(mergeEventId, sourceId, targetId, JSON.stringify(movedIds));
    return { mergeEventId };
  })();
}

export function undoMerge(db: Db, mergeEventId: string): void {
  db.transaction(() => {
    const ev = db
      .prepare('select * from merge_events where id = ?')
      .get(mergeEventId) as
      | {
          id: string;
          source_garment_id: string;
          target_garment_id: string;
          piece_ids_json: string;
          undone_at: string | null;
        }
      | undefined;
    if (!ev) throw new MergeError('merge event not found');
    if (ev.undone_at) throw new MergeError('merge already undone');

    const pieceIds: string[] = JSON.parse(ev.piece_ids_json);
    const back = db.prepare('update pieces set garment_id = ? where id = ?');
    for (const pid of pieceIds) back.run(ev.source_garment_id, pid);
    db.prepare('update garments set merged_into = null where id = ?').run(
      ev.source_garment_id
    );
    db.prepare(
      "update merge_events set undone_at = datetime('now') where id = ?"
    ).run(mergeEventId);
  })();
}

/** Accepting a duplicate suggestion = merge the piece's garment into the suggested one. */
export function acceptSuggestion(db: Db, suggestionId: string): { mergeEventId: string } {
  return db.transaction(() => {
    const s = getSuggestion(db, suggestionId);
    if (!s) throw new MergeError('suggestion not found');
    if (s.status !== 'open') throw new MergeError('suggestion already resolved');
    const piece = getPiece(db, s.piece_id);
    if (!piece) throw new MergeError('piece no longer exists');
    const res = mergeGarments(db, piece.garment_id, s.garment_id);
    setStatus(db, suggestionId, 'accepted');
    return res;
  })();
}

export function listMergeEventsFor(db: Db, garmentId: string) {
  return db
    .prepare(
      `select * from merge_events
       where source_garment_id = ? or target_garment_id = ?
       order by created_at desc`
    )
    .all(garmentId, garmentId);
}
