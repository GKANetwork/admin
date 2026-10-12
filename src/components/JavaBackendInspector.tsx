import React, { useEffect, useState } from 'react';
import {
  BlobProviderType,
  DebugLogEntry,
  GhaGatewayConfigInfo,
  GhaProfile,
  JavaSourceArtifact,
  LogLevel,
} from '../types/gha';
import { GhaGatewayClientFactory } from '../services/ghaGatewayService';
import {
  Copy,
  Check,
  Download,
  FolderGit2,
  Save,
  Terminal,
  Trash2,
  RefreshCw,
  HardDrive,
} from 'lucide-react';

interface JavaBackendInspectorProps {
  gatewayConfig: GhaGatewayConfigInfo | null;
  onSwitchProfile: (profile: GhaProfile) => Promise<void>;
  onUpdateBlobBasePath: (newPath: string, provider?: BlobProviderType) => Promise<void>;
}

export const JavaBackendInspector: React.FC<JavaBackendInspectorProps> = ({
  gatewayConfig,
  onSwitchProfile,
  onUpdateBlobBasePath,
}) => {
  const gatewayClient = GhaGatewayClientFactory.getClient();

  const [sources, setSources] = useState<JavaSourceArtifact[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [syncCommandPreview, setSyncCommandPreview] = useState<string>(
    'Click "Copy Terminal Command" to copy the self-contained sync command to your clipboard...'
  );

  const [blobPathInput, setBlobPathInput] = useState(
    gatewayConfig?.blobStoreBasePath || './local-gha-blobs/dev/landing-sections'
  );
  const [blobProviderInput, setBlobProviderInput] = useState<BlobProviderType>(
    gatewayConfig?.blobProvider || 'local-fs'
  );
  const [savingPath, setSavingPath] = useState(false);
  const [pathSavedMsg, setPathSavedMsg] = useState<string | null>(null);

  // Debug Logs State
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [logLevelFilter, setLogLevelFilter] = useState<'' | LogLevel>('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (gatewayConfig?.blobStoreBasePath) {
      setBlobPathInput(gatewayConfig.blobStoreBasePath);
    }
    if (gatewayConfig?.blobProvider) {
      setBlobProviderInput(gatewayConfig.blobProvider);
    }
  }, [gatewayConfig]);

  const loadLogs = async () => {
    setLoadingLogs(true);
    try {
      const data = await gatewayClient.getDebugLogs(
        logLevelFilter || undefined,
        undefined
      );
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    gatewayClient
      .getJavaBackendSources()
      .then((data) => setSources(data))
      .catch(console.error);
    loadLogs();
  }, [logLevelFilter, gatewayConfig?.activeProfile]);

  const currentFile = sources[selectedIndex];

  const handleCopy = async () => {
    if (!currentFile) return;
    await navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadFile = () => {
    if (!currentFile) return;
    const blob = new Blob([currentFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.title.replace(/\s+\(.*\)/, '');
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveBlobPath = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blobPathInput.trim()) return;
    setSavingPath(true);
    setPathSavedMsg(null);
    try {
      await onUpdateBlobBasePath(blobPathInput.trim(), blobProviderInput);
      setPathSavedMsg(
        `Updated [${gatewayConfig?.activeProfile || 'dev'}] provider='${blobProviderInput}', base-path='${blobPathInput.trim()}'`
      );
      await loadLogs();
      setTimeout(() => setPathSavedMsg(null), 3500);
    } finally {
      setSavingPath(false);
    }
  };

  const handleClearLogs = async () => {
    await gatewayClient.clearDebugLogs();
    await loadLogs();
  };

  return (
    <div className="space-y-8">
      {/* 0. One-Command Local Sync to /Users/jayakumar/project/gha/mobile-app/code */}
      <div className="bg-slate-900 text-white rounded-xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-white">
              1-Click Local Sync → /Users/jayakumar/project/gha/mobile-app/code (No Download or curl Auth Needed)
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Copies a self-contained macOS terminal command that unpacks <code className="font-mono text-emerald-300">service/</code>,{' '}
              <code className="font-mono text-emerald-300">ui/admin/</code>, and{' '}
              <code className="font-mono text-emerald-300">ui/app/</code> directly into <code className="font-mono text-emerald-300">/Users/jayakumar/project/gha/mobile-app/code</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const res = await fetch('/api/v1/events/export/local-sync-command');
              const data = await res.json();
              await navigator.clipboard.writeText(data.command);
              setSyncCommandPreview(
                `mkdir -p ${data.targetDir} && echo '<${(data.archiveBytes / 1024).toFixed(1)} KB base64 bundle>' | base64 --decode | tar -xz -C ${data.targetDir}`
              );
              setCopiedCmd(true);
              setTimeout(() => setCopiedCmd(false), 3000);
            }}
            className="px-3.5 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 rounded-lg inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            {copiedCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedCmd ? 'Copied! Paste (Cmd+V) in Mac Terminal' : 'Copy Mac Sync Command'}</span>
          </button>
        </div>
        <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-emerald-300 overflow-x-auto">
          <code>{syncCommandPreview}</code>
        </pre>
      </div>

      {/* 1. Spring Profiles (dev, qa, prod) & Local vs SeaweedFS Blob Storage Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Spring Boot Profiles (dev, qa, prod) &amp; Local Blob Storage Strategy
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Switch active profile between <code className="font-mono text-xs">dev</code> (Local Disk Storage + DEBUG logs),{' '}
              <code className="font-mono text-xs">qa</code> (QA SeaweedFS + DEBUG logs), and{' '}
              <code className="font-mono text-xs">prod</code> (Production SeaweedFS + INFO logs).
            </p>
          </div>

          {/* Interactive 3-Profile Switcher */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg shrink-0">
            {(['dev', 'qa', 'prod'] as const).map((prof) => {
              const isActive = gatewayConfig?.activeProfile === prof;
              return (
                <button
                  key={prof}
                  type="button"
                  onClick={async () => {
                    await onSwitchProfile(prof);
                    await loadLogs();
                  }}
                  className={`px-3.5 py-1.5 text-xs font-mono font-semibold rounded-md transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  profile={prof}
                </button>
              );
            })}
          </div>
        </div>

        {/* How Local Storage Works Box */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <HardDrive className="w-4 h-4 text-slate-700" />
              <span>1. How Local Image Storage Works (dev profile / local-fs)</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              When <code className="font-mono">gha.blob-store.provider=local-fs</code> (default in{' '}
              <code className="font-mono">application-dev.yml</code>), Spring Boot injects{' '}
              <code className="font-mono">LocalFileSystemBlobStorageAdapter</code> instead of SeaweedFS. Images are written directly to your local disk folder using Java NIO{' '}
              <code className="font-mono">Files.copy()</code> at{' '}
              <code className="font-mono">{gatewayConfig?.blobStoreBasePath}/&lt;category&gt;/&lt;timestamp&gt;_&lt;file&gt;</code>, and that local path is saved in MongoDB (<code className="font-mono">event_db</code>).
            </p>
          </div>
          <div className="space-y-1.5 font-mono text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-3">
            <div className="text-slate-400">Active Runtime Storage Paths on This Machine:</div>
            <div className="truncate">
              <span className="text-slate-500">Active Profile: </span>
              <span className="font-semibold text-slate-900">
                {gatewayConfig?.activeProfile || 'dev'} ({gatewayConfig?.blobStoreProvider})
              </span>
            </div>
            <div className="truncate" title={gatewayConfig?.localPhysicalBlobDir}>
              <span className="text-slate-500">Local Blob Folder: </span>
              <span className="text-emerald-800">{gatewayConfig?.localPhysicalBlobDir}</span>
            </div>
            <div className="truncate" title={gatewayConfig?.localMongoCollectionFile}>
              <span className="text-slate-500">MongoDB JSON File: </span>
              <span className="text-slate-900">{gatewayConfig?.localMongoCollectionFile}</span>
            </div>
          </div>
        </div>

        {/* Dynamic Property Override Form */}
        <form
          onSubmit={handleSaveBlobPath}
          className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
        >
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Blob Storage Strategy (BlobStoragePort)
            </label>
            <select
              value={blobProviderInput}
              onChange={(e) => setBlobProviderInput(e.target.value as BlobProviderType)}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
            >
              <option value="local-fs">local-fs (Local Disk Folder)</option>
              <option value="seaweedfs">seaweedfs (SeaweedFS Filer HTTP)</option>
            </select>
          </div>

          <div className="md:col-span-6">
            <label
              htmlFor="blob-store-path-input"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Blob Store Path Property (GHA_BLOB_STORE_PATH / gha.blob-store.base-path)
            </label>
            <input
              id="blob-store-path-input"
              type="text"
              value={blobPathInput}
              onChange={(e) => setBlobPathInput(e.target.value)}
              className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
            />
          </div>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={savingPath}
              className="w-full px-4 py-2 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingPath ? 'Updating...' : 'Apply Storage Config'}</span>
            </button>
          </div>
        </form>
        {pathSavedMsg && (
          <p className="text-xs font-mono font-medium text-emerald-700">{pathSavedMsg}</p>
        )}
      </div>

      {/* 2. Live Structured Debug Logs Console (SLF4J / Logback format) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-slate-800" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                SLF4J / Logback Debug Log Stream (./logs/gha-event-service.log)
              </h3>
              <p className="text-xs text-slate-500">
                Real-time debug trace with correlation IDs (<code className="font-mono">corrId</code>), active profile, and blob storage paths
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={logLevelFilter}
              onChange={(e) => setLogLevelFilter(e.target.value as '' | LogLevel)}
              className="px-2.5 py-1.5 text-xs font-mono bg-slate-100 border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="">All Levels (DEBUG+)</option>
              <option value="DEBUG">DEBUG Only</option>
              <option value="INFO">INFO Only</option>
              <option value="WARN">WARN Only</option>
              <option value="ERROR">ERROR Only</option>
            </select>
            <button
              type="button"
              onClick={loadLogs}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleClearLogs}
              className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-950 text-slate-200 p-4 font-mono text-xs max-h-[320px] overflow-y-auto space-y-1.5">
          {logs.length === 0 ? (
            <div className="text-slate-500 py-6 text-center">
              No debug logs recorded yet. Perform an action in the Admin Console or switch profiles to see trace output.
            </div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className="leading-relaxed break-all">
                <span className="text-slate-500">{entry.timestamp}</span>{' '}
                <span className="text-sky-400">[profile={entry.profile}]</span>{' '}
                <span className="text-slate-400">[corrId={entry.correlationId}]</span>{' '}
                <span
                  className={
                    entry.level === 'ERROR'
                      ? 'text-red-400 font-bold'
                      : entry.level === 'WARN'
                      ? 'text-amber-300 font-semibold'
                      : entry.level === 'INFO'
                      ? 'text-emerald-400 font-semibold'
                      : 'text-purple-300'
                  }
                >
                  {entry.level.padEnd(5)}
                </span>{' '}
                <span className="text-slate-400">{entry.logger}</span> -{' '}
                <span className="text-slate-100">{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Java 17 / Spring Profiles / Logback / Podman Codebase Viewer */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <FolderGit2 className="w-5 h-5 text-slate-800" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Java 17 Microservice, Profiles (dev/qa/prod), Logback &amp; Local Storage Code
              </h3>
              <p className="text-xs text-slate-500">
                All files are saved in <code className="font-mono">/backend-java/</code> — use Download File or the top toolbar Download ZIP to save to your local machine
              </p>
            </div>
          </div>

          {currentFile && (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/api/v1/events/export/gha-platform-bundle.tar.gz"
                download="gha-platform-bundle.tar.gz"
                className="px-3 py-1.5 text-xs font-semibold text-emerald-950 bg-emerald-100 border border-emerald-300 hover:bg-emerald-200 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download All 4 Repos (.tar.gz)</span>
              </a>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? 'Copied' : 'Copy Code'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadFile}
                className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Current File</span>
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[540px]">
          {/* Left File Tree */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50 divide-y divide-slate-200/70">
            {sources.map((file, idx) => {
              const active = idx === selectedIndex;
              return (
                <button
                  key={file.relativePath}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <div className="text-xs font-mono font-semibold truncate">
                    {file.title}
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 truncate ${
                      active ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {file.module}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Source Code Pane */}
          <div className="lg:col-span-8 bg-slate-950 text-slate-100 flex flex-col">
            {currentFile ? (
              <>
                <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span className="truncate">{currentFile.relativePath}</span>
                  <span className="shrink-0 ml-2">{currentFile.language}</span>
                </div>
                <pre className="p-5 text-xs font-mono leading-relaxed overflow-x-auto flex-1">
                  <code>{currentFile.content}</code>
                </pre>
              </>
            ) : (
              <div className="p-8 text-sm text-slate-400">Loading Java 17 source files...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
