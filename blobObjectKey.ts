/** Converts a stored bucket-prefixed path or an object key to an S3 object key. */
export function blobObjectKey(path: string, bucket: string): string {
  const key = path.replace(/^\/+/, '');
  const prefix = `${bucket}/`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}
