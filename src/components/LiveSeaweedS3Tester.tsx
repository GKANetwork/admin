import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, RefreshCw, HardDrive, CheckCircle2, ExternalLink } from 'lucide-react';

interface LiveS3ObjectItem {
  key: string;
  lastModified: string;
  eTag: string;
  size: number;
  s3Uri: string;
  httpUrl: string;
}

interface LiveSeaweedS3TesterProps {
  refreshTrigger?: number;
  onUploadSuccess?: (msg: string) => void;
}

export const LiveSeaweedS3Tester: React.FC<LiveSeaweedS3TesterProps> = ({
  refreshTrigger = 0,
  onUploadSuccess,
}) => {
  const [objects, setObjects] = useState<LiveS3ObjectItem[]>([]);
  const [endpoint, setEndpoint] = useState<string>('http://103.118.17.94:8333');
  const [bucket, setBucket] = useState<string>('gha-files');
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUploadedUri, setLastUploadedUri] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchS3Objects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/events/s3/list');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setEndpoint(data.endpoint || 'http://103.118.17.94:8333');
      setBucket(data.bucket || 'gha-files');
      setObjects(Array.isArray(data.objects) ? data.objects : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list S3 bucket');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchS3Objects();
  }, [fetchS3Objects, refreshTrigger]);

  const handleDirectUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/v1/events/s3/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
          base64Data,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Upload failed with HTTP ${res.status}`);
      }
      setLastUploadedUri(data.s3Uri);
      if (Array.isArray(data.objects)) {
        setObjects(data.objects);
      } else {
        await fetchS3Objects();
      }
      onUploadSuccess?.(
        `Uploaded ${file.name} directly to VPS S3 (${data.s3Uri}, ETag=${data.eTag})`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload file to S3');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Live VPS SeaweedFS S3 Bucket Tester —{' '}
              <code className="font-mono text-xs text-emerald-800">
                s3://{bucket}/
              </code>{' '}
              ({endpoint})
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Connected live to <code className="font-mono">{endpoint}/{bucket}/</code> using AWS Signature V4 (<code className="font-mono">admin</code>). Any file uploaded here or in the Section Form below is immediately visible in{' '}
            <code className="font-mono text-slate-700">
              aws --endpoint-url http://127.0.0.1:8333 s3 ls s3://gha-files/ --recursive
            </code>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.txt"
            onChange={handleDirectUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{uploading ? 'Uploading to S3...' : 'Test Upload File to s3://gha-files/'}</span>
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={fetchS3Objects}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh S3 List</span>
          </button>
        </div>
      </div>

      {lastUploadedUri && (
        <div className="px-3.5 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            Live S3 Upload Confirmed: <strong className="font-mono">{lastUploadedUri}</strong> is now indexed in SeaweedFS S3 on your VPS!
          </span>
        </div>
      )}

      {error && (
        <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 font-mono">
          S3 Error: {error}
        </div>
      )}

      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div className="bg-slate-950 text-slate-300 px-3.5 py-2 text-xs font-mono flex items-center justify-between">
          <span>
            $ aws --endpoint-url http://127.0.0.1:8333 s3 ls s3://{bucket}/ --recursive
          </span>
          <span className="text-emerald-400 font-semibold">
            {objects.length} object(s) on VPS
          </span>
        </div>
        <div className="divide-y divide-slate-200 max-h-48 overflow-y-auto bg-white">
          {objects.length === 0 ? (
            <div className="p-4 text-xs text-slate-500 font-mono">
              {loading ? 'Querying http://103.118.17.94:8333/gha-files/ ...' : 'No objects in s3://gha-files/ yet.'}
            </div>
          ) : (
            objects.map((obj) => (
              <div
                key={obj.key + obj.eTag}
                className="px-3.5 py-2.5 text-xs font-mono flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <span className="text-slate-400">
                    {obj.lastModified ? obj.lastModified.replace('T', ' ').slice(0, 19) : ''}
                  </span>
                  <span className="text-slate-600 w-20 text-right tabular-nums">
                    {obj.size.toLocaleString()} B
                  </span>
                  <span className="font-semibold text-slate-900 break-all">
                    {obj.key}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-slate-400">ETag: {obj.eTag}</span>
                  <a
                    href={obj.httpUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 hover:underline inline-flex items-center gap-1"
                  >
                    <span>View Blob</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
