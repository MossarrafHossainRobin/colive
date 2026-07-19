import { addDoc, collection, doc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

function cleanValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(cleanValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cleanValue(item)])
    );
  }
  return value;
}

export function buildAuditRecord({
  module,
  action,
  entityType,
  entityId = '',
  month = '',
  summary = '',
  before = null,
  after = null,
  metadata = {},
}) {
  const actor = auth.currentUser;

  return {
    ...cleanValue({
    module,
    action,
    entityType,
    entityId,
    month,
    summary,
    before,
    after,
    metadata,
    actorId: actor?.uid || '',
    actorName: actor?.displayName || actor?.email || 'NestHub Admin',
    }),
    createdAt: serverTimestamp(),
  };
}

export async function createAuditRecord(payload) {
  return addDoc(collection(db, 'adminActivity'), buildAuditRecord(payload));
}

export function stageAuditRecord(batch, payload) {
  const ref = doc(collection(db, 'adminActivity'));
  batch.set(ref, buildAuditRecord(payload));
  return ref;
}

export function auditTimestamp(value) {
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}
