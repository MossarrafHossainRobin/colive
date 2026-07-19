export function mapFirestoreDoc(docSnap) {
  if (!docSnap?.exists?.()) return null;

  return {
    id: docSnap.id,
    ...docSnap.data(),
  };
}

export function mapFirestoreDocs(snapshot) {
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}
