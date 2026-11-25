'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  Radio,
  ShieldAlert,
  Search,
  Cpu,
  Bell,
  Clock,
  Database,
  AlertTriangle,
  UploadCloud,
  RefreshCw,
  Play,
  Info,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const DEFAULT_CHANNELS = [
  'P-1', 'S-1', 'E-1', 'E-2', 'E-3', 'T-1', 'T-2', 'G-1', 'D-1', 'A-1', 'M-1', 'F-1',
];

export default function AegisDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [channels, setChannels] = useState(DEFAULT_CHANNELS);
  const [selectedChannel, setSelectedChannel] = useState('P-1');
  const [detectorType, setDetectorType] = useState('Isolation Forest (Unsupervised ML)');
  const [thresholdPct, setThresholdPct] = useState(1.0);
  const [dataSourceMode, setDataSourceMode] = useState('benchmark');
  const [fileName, setFileName] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [apiData, setApiData] = useState(null);

  const fileInputRef = useRef(null);
  const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

  // Fetch available channels on mount
  useEffect(() => {
    fetch(`${API_BASE}/channels`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.channels?.length) setChannels(data.channels);
      })
      .catch(() => {
        // Keep DEFAULT_CHANNELS fallback silently
      });
  }, [API_BASE]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      setErrorMsg(null);
    }
  };

  const runAnalysis = async () => {
    setIsLoading(true);
    setErrorMsg(null);

    try {
      let response;

      if (dataSourceMode === 'benchmark') {
        const params = new URLSearchParams({
          channel: selectedChannel,
          detector_type: detectorType,
          threshold_pct: String(thresholdPct),
        });
        response = await fetch(`${API_BASE}/run-inference?${params.toString()}`);
      } else {
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
          setErrorMsg('Please select a valid .csv or .parquet telemetry file first.');
          setIsLoading(false);
          return;
        }
        const formData = new FormData();
        formData.append('file', file);
        const params = new URLSearchParams({
          detector_type: detectorType,
          threshold_pct: String(thresholdPct),
        });
        response = await fetch(`${API_BASE}/upload-telemetry?${params.toString()}`, {
          method: 'POST',
          body: formData,
        });
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errBody.detail || `Server returned HTTP ${response.status}`);
      }

      const json = await response.json();
      setApiData(json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error during inference.';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Format chart data without distorting raw telemetry values
  const chartData = useMemo(() => {
    if (!apiData?.predictions) return [];
    return apiData.predictions.map((p) => ({
      step: `T+${p.timestep}`,
      value: Number(p.value.toFixed(4)),
      baseline: p.baseline_value !== undefined ? Number(p.baseline_value.toFixed(4)) : null,
      anomalyVal: p.Predicted_Anomaly === 1 ? Number(p.value.toFixed(4)) : null,
      score: Number(p.Anomaly_Score.toFixed(4)),
      severity: p.Severity || 'Nominal',
      groundTruth: p.ground_truth === 1,
    }));
  }, [apiData]);

  const fmtPct = (val) =>
    val === null || val === undefined ? 'N/A' : `${(val * 100).toFixed(1)}%`;

  const navItems = [
    { id: 'overview', label: 'Overview', icon: <Activity size={15} /> },
    { id: 'anomaly', label: 'AI Anomaly Detection', icon: <ShieldAlert size={15} /> },
    { id: 'rca', label: 'Root Cause Analysis', icon: <Search size={15} /> },
    { id: 'health', label: 'Predictive Health', icon: <Cpu size={15} /> },
    { id: 'alerts', label: 'Triage & Alerts', icon: <Bell size={15} />, badge: apiData?.triage_log?.length || 0 },
  ];

  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full bg-[#030712] text-slate-300 font-sans">
      {/* LEFT SIDEBAR */}
      <aside className="w-full md:w-56 bg-[#060D1A] border-b md:border-b-0 md:border-r border-[#152338] flex flex-col justify-between shrink-0">
        <div>
          <div className="p-4 border-b border-[#152338] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#0055ff] to-[#00e5ff] flex items-center justify-center font-black text-black text-base">
              A
            </div>
            <div>
              <div className="text-[13px] font-bold tracking-wider text-white">ANTELLAY SPACE</div>
              <div className="text-[10px] text-[#00e5ff] font-mono tracking-widest">AEGIS V2</div>
            </div>
          </div>

          <nav className="p-2 flex flex-row md:flex-col gap-1 overflow-x-auto text-xs">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg whitespace-nowrap transition-colors ${
                  activeTab === item.id
                    ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-l-2 border-[#00e5ff] font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-[#0B1526]'
                }`}
              >
                <span className="flex items-center gap-2">
                  {item.icon}
                  {item.label}
                </span>
                {item.badge ? (
                  <span className="ml-2 text-[10px] font-mono px-1.5 bg-red-900/60 border border-red-700 text-red-300 rounded font-bold">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>

        <div className="hidden md:block p-3 border-t border-[#152338]">
          <div className="bg-[#0A1628] border border-[#1E3A5F] p-2.5 rounded-lg">
            <div className="text-[9px] text-slate-400 uppercase font-mono">PLATFORM STATUS</div>
            <div className="text-xs text-white font-semibold mt-0.5">NON-LIVE / ANALYTICS</div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER */}
        <header className="bg-[#060D1A] border-b border-[#152338] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-400">
            <span>Mission Intelligence</span>
            <span>/</span>
            <span className="text-white font-medium">AEGIS Telemetry Analytics</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 bg-[#0A1628] border border-[#1E3A5F] px-2.5 py-1 rounded text-slate-300">
              <Database size={13} className="text-[#00e5ff]" />
              {apiData ? apiData.data_source.label : 'No Dataset Loaded'}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* CONTROLS BAR */}
          <div className="bg-[#060D1A] border border-[#152338] rounded-xl p-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">TELEMETRY ANOMALY INTELLIGENCE</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Run benchmark validation or upload custom CSV/Parquet telemetry for leak-free anomaly detection.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              {/* Source Switch */}
              <div className="flex bg-[#081220] border border-[#152338] p-0.5 rounded-lg">
                <button
                  onClick={() => setDataSourceMode('benchmark')}
                  className={`px-3 py-1.5 rounded ${
                    dataSourceMode === 'benchmark' ? 'bg-[#132438] text-white font-semibold' : 'text-slate-400'
                  }`}
                >
                  NASA BENCHMARK
                </button>
                <button
                  onClick={() => setDataSourceMode('custom')}
                  className={`px-3 py-1.5 rounded ${
                    dataSourceMode === 'custom' ? 'bg-[#132438] text-white font-semibold' : 'text-slate-400'
                  }`}
                >
                  CUSTOM UPLOAD
                </button>
              </div>

              {/* Channel or File Input */}
              {dataSourceMode === 'benchmark' ? (
                <select
                  value={selectedChannel}
                  onChange={(e) => setSelectedChannel(e.target.value)}
                  className="bg-[#0A1628] border border-[#1E3A5F] rounded px-2.5 py-1.5 text-slate-200 outline-none"
                >
                  {channels.map((ch) => (
                    <option key={ch} value={ch}>
                      Channel {ch}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".csv,.parquet"
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-[#1E3A5F] hover:border-[#00e5ff] text-slate-300 px-3 py-1.5 rounded flex items-center gap-1.5"
                  >
                    <UploadCloud size={14} />
                    <span>{fileName || 'SELECT CSV / PARQUET'}</span>
                  </button>
                </>
              )}

              {/* Model Selector */}
              <select
                value={detectorType}
                onChange={(e) => setDetectorType(e.target.value)}
                className="bg-[#0A1628] border border-[#1E3A5F] rounded px-2.5 py-1.5 text-slate-200 outline-none"
              >
                <option value="Isolation Forest (Unsupervised ML)">Isolation Forest</option>
                <option value="Rolling Robust Baseline (Statistical)">Rolling Robust Baseline</option>
              </select>

              {/* Threshold */}
              <label className="flex items-center gap-1.5 bg-[#0A1628] border border-[#1E3A5F] rounded px-2.5 py-1.5 text-slate-300">
                <span>Tail %:</span>
                <input
                  type="number"
                  min={0.5}
                  max={10}
                  step={0.5}
                  value={thresholdPct}
                  onChange={(e) => setThresholdPct(Number(e.target.value))}
                  className="w-12 bg-transparent text-[#00e5ff] font-bold outline-none"
                />
              </label>

              {/* Run Button */}
              <button
                onClick={runAnalysis}
                disabled={isLoading}
                className="bg-[#00e5ff] hover:bg-[#00cce6] disabled:bg-slate-700 text-black font-bold px-4 py-1.5 rounded flex items-center gap-1.5 cursor-pointer"
              >
                {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
                <span>{isLoading ? 'ANALYZING...' : 'RUN INFERENCE'}</span>
              </button>
            </div>
          </div>

          {/* DATA PROVENANCE DISCLOSURE BANNER */}
          {apiData && (
            <div className="bg-blue-950/30 border border-blue-800/60 rounded-lg px-3.5 py-2.5 flex items-start gap-2.5 text-xs">
              <Info size={16} className="text-[#00e5ff] shrink-0 mt-0.5" />
              <div>
                <span className="font-mono font-bold text-white uppercase mr-2">
                  [{apiData.data_source.type.replace('_', ' ')}]
                </span>
                <span className="text-slate-300">{apiData.data_source.disclosure}</span>
              </div>
            </div>
          )}

          {/* ERROR STATE */}
          {errorMsg && (
            <div className="bg-red-950/40 border border-red-800 rounded-lg p-3.5 flex items-center gap-2.5 text-xs text-red-200">
              <XCircle size={16} className="text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* EMPTY STATE */}
          {!apiData && !isLoading && !errorMsg && (
            <div className="bg-[#060D1A] border border-dashed border-[#1E3A5F] rounded-xl p-10 text-center flex flex-col items-center gap-2">
              <Radio size={28} className="text-[#00e5ff]" />
              <div className="text-sm font-semibold text-white">Ready for Telemetry Analysis</div>
              <p className="text-xs text-slate-400 max-w-md">
                Select a NASA Telemanom benchmark channel or upload a custom CSV/Parquet file above, then click{' '}
                <strong className="text-white">RUN INFERENCE</strong> to populate real metrics, anomaly charts, and
                root-cause hypotheses.
              </p>
            </div>
          )}

          {/* POPULATED DASHBOARD */}
          {apiData && (
            <>
              {/* REAL EVALUATION METRICS ROW */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricCard label="PRECISION" value={fmtPct(apiData.metrics.precision)} />
                <MetricCard label="RECALL" value={fmtPct(apiData.metrics.recall)} />
                <MetricCard label="F1 SCORE" value={fmtPct(apiData.metrics.f1)} highlight />
                <MetricCard label="FALSE POS RATE" value={fmtPct(apiData.metrics.fpr)} />
                <MetricCard
                  label="SEQ CAUGHT"
                  value={
                    apiData.metrics.detected_sequences !== null
                      ? `${apiData.metrics.detected_sequences} / ${apiData.metrics.total_sequences}`
                      : 'N/A'
                  }
                />
                <MetricCard
                  label="MEAN DELAY"
                  value={
                    apiData.metrics.mean_detection_delay !== null && apiData.metrics.mean_detection_delay !== 'N/A'
                      ? `${apiData.metrics.mean_detection_delay} steps`
                      : 'N/A'
                  }
                />
              </div>

              {/* TELEMETRY CHART */}
              {(activeTab === 'overview' || activeTab === 'anomaly') && (
                <div className="bg-[#060D1A] border border-[#152338] rounded-xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-white uppercase">Telemetry Signal & Anomaly Detection</h2>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Observed signal vs. rolling robust baseline (last {chartData.length} timesteps)
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] font-mono text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-0.5 bg-[#00e5ff]" /> Observed
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-0.5 border-t border-dashed border-slate-400" /> Baseline
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-pink-500" /> Predicted Anomaly
                      </span>
                    </div>
                  </div>

                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                        <defs>
                          <linearGradient id="sigGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#00e5ff" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 2" stroke="#0E1A2B" vertical={false} />
                        <XAxis dataKey="step" stroke="#475569" fontSize={10} tickLine={false} />
                        <YAxis stroke="#475569" fontSize={10} tickLine={false} domain={['auto', 'auto']} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="value" stroke="#00e5ff" strokeWidth={1.5} fill="url(#sigGrad)" />
                        <Line type="monotone" dataKey="baseline" stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1.2} dot={false} />
                        <Line type="monotone" dataKey="anomalyVal" stroke="#ec4899" strokeWidth={0} dot={{ r: 4, fill: '#ec4899' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* LOWER PANELS: RCA + PREDICTIVE HEALTH + TRIAGE */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* ROOT CAUSE ANALYSIS */}
                {(activeTab === 'overview' || activeTab === 'rca') && (
                  <div className="bg-[#060D1A] border border-[#152338] rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-2 border-b border-[#152338]">
                        <span className="text-xs font-semibold text-white uppercase">Root Cause Analysis</span>
                        <span className="text-[9px] font-mono text-amber-300 border border-amber-700 bg-amber-950/40 px-1.5 py-0.5 rounded uppercase">
                          AI HYPOTHESIS
                        </span>
                      </div>
                      <p className="text-[10px] text-amber-300/90 font-mono mt-2">{apiData.root_cause.disclaimer}</p>

                      <div className="mt-3">
                        <div className="text-[10px] text-slate-400 uppercase font-mono">Suspected Subsystem</div>
                        <div className="text-xs font-bold text-red-400 flex items-center gap-1.5 mt-1">
                          <AlertTriangle size={14} />
                          {apiData.root_cause.primary_suspect}
                        </div>
                      </div>

                      <ul className="mt-3 space-y-1.5 text-[11px] font-mono text-slate-300">
                        {apiData.root_cause.evidence.map((ev, i) => (
                          <li key={i} className="bg-[#0A1628] border border-[#152338] rounded p-2">
                            {ev}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-3 pt-2 border-t border-[#152338] text-[11px] text-cyan-300 font-mono">
                      {apiData.root_cause.triage_action}
                    </div>
                  </div>
                )}

                {/* PREDICTIVE HEALTH */}
                {(activeTab === 'overview' || activeTab === 'health') && (
                  <div className="bg-[#060D1A] border border-[#152338] rounded-xl p-4 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between pb-2 border-b border-[#152338]">
                        <span className="text-xs font-semibold text-white uppercase">Predictive Health</span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                            apiData.predictive_health.available
                              ? 'text-emerald-300 border-emerald-700 bg-emerald-950/40'
                              : 'text-slate-400 border-slate-700 bg-slate-900'
                          }`}
                        >
                          {apiData.predictive_health.available ? 'COMPUTED' : 'UNAVAILABLE'}
                        </span>
                      </div>

                      <div className="mt-4 space-y-2.5 text-xs font-mono">
                        <div className="flex justify-between py-1 border-b border-[#0F1B2D]">
                          <span className="text-slate-400">Current Battery / SoC:</span>
                          <span className="text-white font-bold">{apiData.predictive_health.battery_level}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[#0F1B2D]">
                          <span className="text-slate-400">Est. Time to Critical:</span>
                          <span className="text-amber-400 font-bold">{apiData.predictive_health.time_to_critical}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-[#0F1B2D]">
                          <span className="text-slate-400">Risk Classification:</span>
                          <span className="text-cyan-400 font-bold">{apiData.predictive_health.risk_level}</span>
                        </div>
                      </div>
                    </div>

                    <p className="mt-3 text-[10px] font-mono text-slate-400 bg-[#0A1628] border border-[#152338] rounded p-2">
                      Limitation: {apiData.predictive_health.limitation}
                    </p>
                  </div>
                )}

                {/* TRIAGE & ALERTS LOG */}
                {(activeTab === 'overview' || activeTab === 'alerts') && (
                  <div className="bg-[#060D1A] border border-[#152338] rounded-xl p-4 flex flex-col">
                    <div className="flex items-center justify-between pb-2 border-b border-[#152338]">
                      <span className="text-xs font-semibold text-white uppercase">Detected Anomaly Triage Log</span>
                      <Clock size={14} className="text-[#00e5ff]" />
                    </div>

                    {apiData.triage_log.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center py-6 text-xs text-slate-400 gap-1.5">
                        <CheckCircle2 size={20} className="text-emerald-400" />
                        <span>No anomalies detected above threshold.</span>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-1 text-[11px] font-mono">
                        {apiData.triage_log.map((item, idx) => (
                          <div key={idx} className="bg-[#0A1628] border border-[#152338] rounded p-2">
                            <div className="flex items-center justify-between">
                              <span className="text-white font-bold">Timestep T+{item.timestep}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/60 border border-red-800 text-red-300">
                                {item.Severity || 'Anomaly'} · Score {item.Anomaly_Score}
                              </span>
                            </div>
                            {item.Supporting_Evidence && (
                              <div className="text-[10px] text-slate-400 mt-1">{item.Supporting_Evidence}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function MetricCard({ label, value, highlight }) {
  return (
    <div className="bg-[#060D1A] border border-[#152338] rounded-xl p-3">
      <div className="text-[10px] font-mono text-slate-400 uppercase">{label}</div>
      <div className={`text-lg font-bold font-mono mt-1 ${highlight ? 'text-[#00e5ff]' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-[#0A1628] border border-[#1E3A5F] p-2.5 rounded-lg shadow-xl text-xs font-mono">
        <div className="text-slate-400 text-[10px] mb-1">{String(d.step)}</div>
        <div className="text-[#00e5ff] font-bold">Observed: {String(d.value)}</div>
        {d.baseline !== null && <div className="text-slate-300">Baseline: {String(d.baseline)}</div>}
        <div className="text-slate-300">Score: {String(d.score)}</div>
        {d.anomalyVal !== null && <div className="text-pink-400 font-bold mt-1">Flagged: {String(d.severity)}</div>}
      </div>
    );
  }
  return null;
}
