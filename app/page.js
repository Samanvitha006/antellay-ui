'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  Activity,
  Radio,
  ShieldAlert,
  Search,
  Cpu,
  Bell,
  ChevronRight,
  Clock,
  FileText,
  Settings,
  Database,
  AlertTriangle,
  UploadCloud,
  RefreshCw,
  Play,
  Battery,
  Thermometer,
  Sun,
  Wifi,
  Zap,
  HelpCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export default function AegisDashboard() {
  // Navigation & Interactive UI state
  const [activeTab, setActiveTab] = useState('anomaly');
  const [timeRange, setTimeRange] = useState('6H');
  const [selectedChannel, setSelectedChannel] = useState('Channel P-1');
  const [dataSource, setDataSource] = useState('default');
  const [fileName, setFileName] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef(null);

  // Default synthetic curve fallback matching the NASA P-1 telemetry signature
  const defaultCurve = useMemo(() => {
    return Array.from({ length: 48 }, (_, i) => {
      const timeStep = 1400 + i * 2;
      let baseVal = 70 + Math.sin(i / 3) * 15 - (i > 24 ? (i - 24) * 1.8 : 0);
      let isAnomaly = (i >= 14 && i <= 17) || (i >= 38 && i <= 41);
      let val = isAnomaly ? baseVal + 38 : baseVal;
      return {
        time: `T+${timeStep}`,
        utc: `Apr 26, ${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`,
        signal: parseFloat(val.toFixed(2)),
        anomalyVal: isAnomaly ? parseFloat(val.toFixed(2)) : null,
        refAnomaly: i >= 13 && i <= 18 ? 80 : null,
        score: isAnomaly ? 0.97 : 0.04,
      };
    });
  }, []);

  const [rawChartData, setRawChartData] = useState(defaultCurve);
  const [metrics, setMetrics] = useState({
    battery: { val: '68%', change: '+2.4%', up: true },
    temperature: { val: '31.4 °C', change: '↓ 1.2%', up: false },
    solar: { val: '428 W', change: '+3.8%', up: true },
    signal: { val: '-68 dBm', change: '+1.5%', up: true },
    cpu: { val: '43%', change: '↓ 0.8%', up: false },
    voltage: { val: '27.8 V', change: '+1.9%', up: true },
    anomalyScore: '0.97',
    confidence: '94%',
    affectedSubsystem: 'POWER',
    f1: '45.7%',
    detectedSequences: '3/3',
    detectionDelay: '12.3 steps',
  });

  // Dynamic timeframe filter for the active chart
  const displayedChartData = useMemo(() => {
    if (!rawChartData || rawChartData.length === 0) return [];
    const len = rawChartData.length;
    switch (timeRange) {
      case '1H':
        return rawChartData.slice(Math.max(0, len - 12));
      case '6H':
        return rawChartData.slice(Math.max(0, len - 24));
      case '24H':
        return rawChartData.slice(Math.max(0, len - 36));
      case '7D':
      default:
        return rawChartData;
    }
  }, [rawChartData, timeRange]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFileName(file.name);
    }
  };

 

    const runAnalysis = async () => {
    setIsAnalyzing(true);
    // Removes trailing slash if present
    const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');

    try {
      let response;
      if (dataSource === 'default') {
        // Exact endpoint for NASA data
        const channelCode = selectedChannel.replace('Channel ', '');
        response = await fetch(`${API_BASE}/run-inference?channel=${channelCode}`);
      } else {
        // Exact endpoint for Custom file upload
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
          alert('Please select a valid CSV or Parquet file first.');
          setIsAnalyzing(false);
          return;
        }
        const formData = new FormData();
        formData.append('file', file);
        response = await fetch(`${API_BASE}/upload-telemetry`, {
          method: 'POST',
          body: formData,
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errText}`);
      }

      const res = await response.json();

      const rawRecords = res.predictions || res.telemetry || res.data || [];
      if (Array.isArray(rawRecords) && rawRecords.length > 0) {
        const formatted = rawRecords.map((p, idx) => {
          const rawVal = p.value ?? p.channel_1 ?? p.signal ?? 0;
          const scaledSignal = parseFloat((rawVal * 50 + 50).toFixed(2));
          const isAnomaly = p.Predicted_Anomaly === 1 || p.anomaly === 1 || p.is_anomaly === true || (p.score && p.score > 0.8);
          const groundTruth = p.Ground_Truth === 1 || p.ground_truth === 1;

          return {
            time: `T+${p.timestep ?? idx}`,
            utc: p.utc || `T+${p.timestep ?? idx}`,
            signal: scaledSignal,
            anomalyVal: isAnomaly ? scaledSignal : null,
            refAnomaly: groundTruth ? 80 : null,
            score: p.score !== undefined ? parseFloat(p.score.toFixed(2)) : isAnomaly ? 0.98 : 0.05,
          };
        });

        setRawChartData(formatted);
        const anomalyCount = formatted.filter((item) => item.anomalyVal !== null).length;
        
        setMetrics((prev) => ({
          ...prev,
          anomalyScore: formatted.length > 0 ? (anomalyCount / formatted.length).toFixed(2) : '0.00',
          affectedSubsystem: dataSource === 'custom' ? 'PAYLOAD / SENSOR' : 'POWER',
          detectedSequences: `${anomalyCount}/${anomalyCount > 0 ? anomalyCount : 1}`,
        }));
      } else {
        alert('Backend request succeeded, but no telemetry data was found in the response.');
      }
    } catch (err) {
      console.error('Inference Failed:', err);
      alert(`Inference failed: ${err.message}\n\nCheck F12 Developer Tools -> Network tab for details.`);
    } finally {
      setIsAnalyzing(false);
    }
  };

        // Update live metrics dynamically based on payload
        const anomalyCount = formatted.filter((item) => item.anomalyVal !== null).length;
        setMetrics((prev) => ({
          ...prev,
          anomalyScore: (anomalyCount / formatted.length).toFixed(2),
          confidence: '96%',
          affectedSubsystem: dataSource === 'custom' ? 'PAYLOAD / SENSOR' : 'POWER',
          detectedSequences: `${anomalyCount}/${anomalyCount > 0 ? anomalyCount : 1}`,
          ...(res.metrics && {
            f1: res.metrics.f1 ? `${(res.metrics.f1 * 100).toFixed(1)}%` : prev.f1,
            detectionDelay: res.metrics.mean_detection_delay ? `${res.metrics.mean_detection_delay} steps` : prev.detectionDelay,
          }),
        }));
      }
    } catch (err) {
      console.error('Telemetry Pipeline Request Failed:', err);
      alert('Inference server connection failed on port 8080. Displaying local cache.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const navItems = [
    { id: 'overview', label: 'Overview', icon: <Activity size={15} /> },
    { id: 'explorer', label: 'Telemetry Explorer', icon: <Radio size={15} /> },
    { id: 'anomaly', label: 'AI Anomaly Detection', icon: <ShieldAlert size={15} /> },
    { id: 'rca', label: 'Root Cause Analysis', icon: <Search size={15} /> },
    { id: 'health', label: 'Predictive Health', icon: <Cpu size={15} /> },
    { id: 'alerts', label: 'Alerts & Incidents', icon: <Bell size={15} />, badge: '2' },
    { id: 'recommendations', label: 'Recommendations', icon: <ChevronRight size={15} /> },
    { id: 'timeline', label: 'Mission Timeline', icon: <Clock size={15} /> },
    { id: 'reports', label: 'Reports & Exports', icon: <FileText size={15} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={15} /> },
  ];

  return (
    <div className="flex h-screen w-full bg-[#030712] text-slate-300 font-sans overflow-hidden select-none">
      {/* 1. LEFT DOCK NAVIGATION */}
      <aside className="w-56 bg-[#060D1A] border-r border-[#152338] flex flex-col justify-between shrink-0">
        <div>
          {/* Brand header */}
          <div className="p-4 border-b border-[#152338] flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#0055ff] to-[#00e5ff] flex items-center justify-center font-black text-black text-base shadow-[0_0_12px_rgba(0,229,255,0.4)]">
              A
            </div>
            <div>
              <div className="text-[13px] font-bold tracking-wider text-white">ANTELLAY SPACE</div>
              <div className="text-[10px] text-[#00e5ff] font-mono tracking-widest">AEGIS V2</div>
            </div>
          </div>

          {/* Dynamic Navigation Links */}
          <nav className="p-2 flex flex-col gap-1 text-xs">
            {navItems.map((item) => (
              <NavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeTab === item.id}
                badge={item.badge}
                onClick={() => setActiveTab(item.id)}
              />
            ))}
          </nav>
        </div>

        {/* System Mode Footer */}
        <div className="p-3 border-t border-[#152338]">
          <div className="bg-[#0A1628] border border-[#1E3A5F] p-2.5 rounded-lg flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <div>
              <div className="text-[9px] text-slate-400 uppercase tracking-wider font-mono">SYSTEM MODE</div>
              <div className="text-xs text-white font-semibold">RESEARCH PROTOTYPE</div>
            </div>
          </div>
          <div className="text-[9px] text-slate-500 font-mono mt-2 text-center">ANTELLAY SPACE · AEGIS V2</div>
        </div>
      </aside>

      {/* 2. MAIN MISSION CENTER */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* TOP STATUS BAR */}
        <header className="h-12 bg-[#060D1A] border-b border-[#152338] px-4 flex items-center justify-between text-xs font-mono shrink-0">
          <div className="flex items-center gap-2 text-slate-400 text-[11px]">
            <span>Mission Intelligence</span>
            <span>/</span>
            <span className="text-white font-medium">Mission AE-01</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#0A1628] border border-[#1E3A5F] px-2.5 py-1 rounded text-slate-300">
              <Database size={13} className="text-[#00e5ff]" />
              <span>NASA SMAP · {selectedChannel}</span>
            </div>

            <div className="flex items-center gap-1.5 bg-amber-950/40 border border-amber-600/50 text-amber-300 px-2.5 py-1 rounded text-[11px]">
              <AlertTriangle size={13} />
              <span>WARNING</span>
            </div>

            <div className="bg-[#0A1628] border border-[#1E3A5F] text-slate-300 px-2.5 py-1 rounded text-[11px]">
              DEMO MODE
            </div>

            <button className="text-slate-400 hover:text-white p-1">
              <Search size={15} />
            </button>
            <button className="text-slate-400 hover:text-white p-1 relative">
              <Bell size={15} />
              <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-[#00e5ff] rounded-full"></span>
            </button>
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-500 border border-cyan-300 flex items-center justify-center text-[10px] text-white font-bold">
              OP
            </div>
          </div>
        </header>

        {/* WORKSPACE CONTENT BODY */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 custom-scrollbar">
          {/* HEADER INTRO & INGEST CONTROLS */}
          <div className="flex justify-between items-end border-b border-[#152338] pb-3 shrink-0">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800 text-blue-300 uppercase">
                  AEGIS V2 · TELEMETRY ANALYTICS
                </span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white">MISSION INTELLIGENCE</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                AI-powered satellite health monitoring, anomaly diagnosis and predictive mission insights.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-[#081220] border border-[#152338] p-0.5 rounded-lg text-xs font-mono">
                <button
                  onClick={() => setDataSource('default')}
                  className={`px-3 py-1 rounded transition-colors ${
                    dataSource === 'default' ? 'bg-[#132438] text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  NASA SMAP (P-1)
                </button>
                <button
                  onClick={() => setDataSource('custom')}
                  className={`px-3 py-1 rounded transition-colors ${
                    dataSource === 'custom' ? 'bg-[#132438] text-white font-medium' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  CUSTOM INGEST
                </button>
              </div>

              {dataSource === 'custom' && (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileUpload}
                    accept=".csv,.parquet"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="border border-dashed border-[#1E3A5F] hover:border-[#00e5ff] text-slate-300 hover:text-[#00e5ff] px-2.5 py-1 rounded text-xs flex items-center gap-1.5 font-mono transition-colors"
                  >
                    <UploadCloud size={13} />
                    <span>{fileName || 'SELECT CSV'}</span>
                  </button>
                </>
              )}

              <button
                onClick={runAnalysis}
                disabled={isAnalyzing}
                className="bg-[#00e5ff] hover:bg-[#00cce6] disabled:bg-slate-700 text-black font-semibold px-3.5 py-1.5 rounded text-xs font-mono flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,229,255,0.3)] transition-all cursor-pointer"
              >
                {isAnalyzing ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} fill="currentColor" />}
                <span>{isAnalyzing ? 'INFERRING...' : 'RUN INFERENCE'}</span>
              </button>
            </div>
          </div>

          {/* 3. SIX HORIZONTAL STATUS SPARKLINES */}
          <div className="grid grid-cols-6 gap-2.5 shrink-0">
            <SparklineCard icon={<Battery size={14} className="text-cyan-400" />} label="BATTERY" value={metrics.battery.val} delta={metrics.battery.change} up={metrics.battery.up} color="#00e5ff" />
            <SparklineCard icon={<Thermometer size={14} className="text-indigo-400" />} label="TEMPERATURE" value={metrics.temperature.val} delta={metrics.temperature.change} up={metrics.temperature.up} color="#818cf8" />
            <SparklineCard icon={<Sun size={14} className="text-amber-400" />} label="SOLAR POWER" value={metrics.solar.val} delta={metrics.solar.change} up={metrics.solar.up} color="#fbbf24" />
            <SparklineCard icon={<Wifi size={14} className="text-teal-400" />} label="SIGNAL STRENGTH" value={metrics.signal.val} delta={metrics.signal.change} up={metrics.signal.up} color="#2dd4bf" />
            <SparklineCard icon={<Cpu size={14} className="text-blue-400" />} label="CPU LOAD" value={metrics.cpu.val} delta={metrics.cpu.change} up={metrics.cpu.up} color="#60a5fa" />
            <SparklineCard icon={<Zap size={14} className="text-cyan-400" />} label="VOLTAGE" value={metrics.voltage.val} delta={metrics.voltage.change} up={metrics.voltage.up} color="#00e5ff" />
          </div>

          {/* 4. MID DUAL WORKSPACE: TELEMETRY CHART (LEFT) & ANOMALY DIAGNOSIS (RIGHT) */}
          <div className="grid grid-cols-12 gap-3 shrink-0">
            {/* LEFT 8 COLS: Telemetry Signal Analysis */}
            <div className="col-span-8 bg-[#060D1A] border border-[#152338] rounded-xl p-3.5 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-sm font-semibold text-white tracking-wide uppercase">TELEMETRY SIGNAL ANALYSIS</h3>
                  <p className="text-[11px] text-slate-400 font-mono">{selectedChannel} · Historical signal & anomaly intervals</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex bg-[#0A1628] border border-[#152338] rounded text-[11px] font-mono p-0.5">
                    {['1H', '6H', '24H', '7D'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setTimeRange(t)}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          timeRange === t ? 'bg-[#16273e] text-white font-bold' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <select
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                    className="bg-[#0A1628] border border-[#152338] rounded px-2 py-0.5 text-[11px] font-mono text-slate-300 outline-none cursor-pointer"
                  >
                    <option value="Channel P-1">Channel P-1 (Power)</option>
                    <option value="Channel V-2">Channel V-2 (Voltage)</option>
                    <option value="Channel T-4">Channel T-4 (Thermal)</option>
                  </select>
                </div>
              </div>

              {/* Chart Legend Indicators */}
              <div className="flex items-center gap-4 text-[10px] font-mono text-slate-400 mb-2">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-[#00e5ff]"></span> Normal Signal</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_6px_#ec4899]"></span> Detected Anomaly</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 border-t border-dashed border-red-500"></span> Spec Threshold</span>
              </div>

              {/* Interactive Telemetry Canvas */}
              <div className="h-64 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={displayedChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="telemetryGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00e5ff" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#00e5ff" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 2" stroke="#0E1A2B" vertical={false} />
                    <XAxis dataKey="utc" stroke="#334155" fontSize={9} tickLine={false} />
                    <YAxis stroke="#334155" fontSize={9} tickLine={false} domain={['auto', 'auto']} />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={85} stroke="#ef4444" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="signal" stroke="#00e5ff" strokeWidth={1.5} fillOpacity={1} fill="url(#telemetryGrad)" />
                    <Line type="monotone" dataKey="anomalyVal" stroke="#ec4899" strokeWidth={2.5} dot={{ r: 4, fill: '#ec4899' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* RIGHT 4 COLS: AI Anomaly Detection Card */}
            <div className="col-span-4 bg-[#060D1A] border border-[#152338] rounded-xl p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-[#152338]">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-white tracking-wide uppercase">
                    <ShieldAlert size={14} className="text-red-400" />
                    <span>AI ANOMALY DETECTION</span>
                  </div>
                  <span className="text-[9px] font-mono bg-red-950/60 border border-red-800 text-red-400 px-1.5 py-0.5 rounded font-bold uppercase">
                    CRITICAL
                  </span>
                </div>

                <div className="mt-3 bg-red-950/20 border border-red-900/40 rounded-lg p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></div>
                    <div>
                      <div className="text-xs font-bold text-red-200 uppercase">ANOMALY DETECTED</div>
                      <div className="text-[10px] text-red-400 font-mono">Telemetry signature mismatch</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-red-900/40 border border-red-700/60 text-red-300 rounded font-bold">
                    HIGH
                  </span>
                </div>

                {/* Quantitative Sub-Metrics */}
                <div className="mt-3 flex flex-col gap-2 font-mono text-xs">
                  <div className="flex justify-between py-1 border-b border-[#0F1B2D]">
                    <span className="text-slate-400 text-[11px]">Primary Symptom</span>
                    <span className="text-white font-medium">Battery voltage abnormal</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#0F1B2D]">
                    <span className="text-slate-400 text-[11px]">Anomaly Score</span>
                    <span className="text-[#00e5ff] font-bold">{metrics.anomalyScore}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#0F1B2D]">
                    <span className="text-slate-400 text-[11px]">Model Confidence</span>
                    <span className="text-white font-bold">{metrics.confidence}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#0F1B2D]">
                    <span className="text-slate-400 text-[11px]">Affected Subsystem</span>
                    <span className="text-amber-400 font-bold">{metrics.affectedSubsystem}</span>
                  </div>
                </div>

                {/* Mini sparkline visualization */}
                <div className="mt-3 h-14 bg-[#030712] rounded border border-[#152338] p-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayedChartData.slice(-18)}>
                      <Line type="monotone" dataKey="signal" stroke="#ec4899" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <button
                onClick={() => setActiveTab('anomaly')}
                className="mt-3 w-full bg-[#0A1628] hover:bg-[#12233C] border border-[#1E3A5F] text-slate-200 hover:text-white py-1.5 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>VIEW ANOMALY DETAILS</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>

          {/* 5. FOUR BOTTOM COMPONENT TILES */}
          <div className="grid grid-cols-4 gap-3 shrink-0">
            {/* Tile 1: Root Cause Analysis */}
            <div className="bg-[#060D1A] border border-[#152338] rounded-xl p-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-[#152338]">
                  <span className="text-xs font-semibold text-white tracking-wide uppercase">ROOT CAUSE ANALYSIS</span>
                  <span className="text-[9px] font-mono text-cyan-400 border border-cyan-800 bg-cyan-950/40 px-1 rounded">SUSPECTED</span>
                </div>
                <div className="mt-2.5">
                  <div className="text-[10px] text-slate-400 uppercase font-mono">Primary Suspected Cause</div>
                  <div className="text-xs font-bold text-red-400 flex items-center gap-1.5 mt-0.5">
                    <AlertTriangle size={13} /> Battery / Power Subsystem
                  </div>
                </div>
                <div className="mt-2.5 flex flex-col gap-1 text-[11px] font-mono text-slate-400">
                  <div className="flex justify-between items-center">
                    <span>→ Battery voltage decreasing</span>
                    <span className="text-red-400 font-bold">↓ 4.2%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>→ Power consumption increasing</span>
                    <span className="text-amber-400 font-bold">↑ 6.8%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>→ Solar generation decreasing</span>
                    <span className="text-red-400 font-bold">↓ 7.3%</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('rca')}
                className="mt-2.5 w-full bg-[#0A1628] hover:bg-[#12233C] border border-[#1E3A5F] text-slate-300 py-1 rounded text-[11px] font-mono flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <span>INVESTIGATE ROOT CAUSE</span>
                <ChevronRight size={12} />
              </button>
            </div>

            {/* Tile 2: Predictive Health Gauge */}
            <div className="bg-[#060D1A] border border-[#152338] rounded-xl p-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-[#152338]">
                  <span className="text-xs font-semibold text-white tracking-wide uppercase">PREDICTIVE HEALTH</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="w-16 h-16 rounded-full border-4 border-[#00e5ff] border-t-transparent flex items-center justify-center font-bold text-sm text-white font-mono shadow-[0_0_10px_rgba(0,229,255,0.2)]">
                    {metrics.battery.val}
                  </div>
                  <div className="text-[11px] font-mono flex flex-col gap-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Current Battery:</span>
                      <span className="text-white font-bold">{metrics.battery.val}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Critical Threshold:</span>
                      <span className="text-red-400 font-bold">40%</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Time to Critical:</span>
                      <span className="text-amber-400 font-bold">~ 7h 21m</span>
                    </div>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-[#152338] flex justify-between items-center text-[10px] font-mono">
                  <span className="text-slate-400">Battery Trend (Next 24 Hours)</span>
                  <span className="text-red-400 font-bold bg-red-950/40 px-1 border border-red-800 rounded">HIGH RISK</span>
                </div>
              </div>
              <div className="h-6 w-full bg-[#030712] rounded border border-[#152338] mt-1 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-amber-500 w-[68%]"></div>
              </div>
            </div>

            {/* Tile 3: Recommended Actions */}
            <div className="bg-[#060D1A] border border-[#152338] rounded-xl p-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-[#152338]">
                  <span className="text-xs font-semibold text-white tracking-wide uppercase">RECOMMENDED ACTIONS</span>
                  <HelpCircle size={13} className="text-slate-500" />
                </div>
                <div className="mt-2 flex flex-col gap-1.5 text-[11px]">
                  <div className="p-1.5 bg-[#091524] border border-[#1B2F48] rounded hover:border-[#00e5ff] cursor-pointer flex items-start gap-1.5 transition-colors">
                    <ChevronRight size={13} className="text-[#00e5ff] mt-0.5 shrink-0" />
                    <div>
                      <div className="text-white font-medium">Reduce non-critical payload activity</div>
                      <div className="text-[10px] text-slate-400">Conserves power & reduces thermal stress</div>
                    </div>
                  </div>
                  <div className="p-1.5 bg-[#091524] border border-[#1B2F48] rounded hover:border-[#00e5ff] cursor-pointer flex items-start gap-1.5 transition-colors">
                    <ChevronRight size={13} className="text-[#00e5ff] mt-0.5 shrink-0" />
                    <div>
                      <div className="text-white font-medium">Enter power conservation mode</div>
                      <div className="text-[10px] text-slate-400">Optimizes bus health for eclipse entry</div>
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => alert('Command dispatched to orbital telemetry bus.')}
                className="mt-2 w-full bg-cyan-950/40 hover:bg-cyan-900/60 border border-[#00e5ff]/50 text-[#00e5ff] py-1 rounded text-[11px] font-mono font-semibold transition-colors cursor-pointer"
              >
                OPERATOR APPROVAL REQUIRED
              </button>
            </div>

            {/* Tile 4: Recent Alerts */}
            <div className="bg-[#060D1A] border border-[#152338] rounded-xl p-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-1.5 border-b border-[#152338]">
                  <span className="text-xs font-semibold text-white tracking-wide uppercase">RECENT ALERTS</span>
                  <span
                    onClick={() => setActiveTab('alerts')}
                    className="text-[10px] font-mono text-[#00e5ff] cursor-pointer hover:underline"
                  >
                    View All &gt;
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-1.5 text-[11px] font-mono">
                  <div className="flex items-center justify-between py-1 border-b border-[#0F1B2D]">
                    <span className="flex items-center gap-1.5 text-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Channel P-1
                    </span>
                    <span className="text-slate-300 text-[10px]">Voltage abnormal</span>
                    <span className="text-red-400 border border-red-800 bg-red-950/60 px-1 rounded text-[9px]">Open</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-[#0F1B2D]">
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Channel V-2
                    </span>
                    <span className="text-slate-300 text-[10px]">Temp rising (31.4°C)</span>
                    <span className="text-amber-400 border border-amber-800 bg-amber-950/60 px-1 rounded text-[9px]">Investigating</span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span> Channel H-3
                    </span>
                    <span className="text-slate-300 text-[10px]">Signal degradation</span>
                    <span className="text-cyan-400 border border-cyan-800 bg-cyan-950/60 px-1 rounded text-[9px]">Resolved</span>
                  </div>
                </div>
              </div>
              <div className="text-[10px] font-mono text-slate-500 text-center">
                F1-SCORE: <span className="text-[#00e5ff]">{metrics.f1}</span> · SEQ CAUGHT: <span className="text-white">{metrics.detectedSequences}</span>
              </div>
            </div>
          </div>

          {/* 6. MISSION EVENT TIMELINE STRIP */}
          <div className="bg-[#060D1A] border border-[#152338] rounded-xl p-3 flex items-center justify-between shrink-0 font-mono text-xs">
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-[#00e5ff]" />
              <div>
                <div className="text-white font-bold text-xs uppercase">MISSION EVENT TIMELINE</div>
                <div className="text-[10px] text-slate-500">Sequential telemetry anomaly progression</div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <TimelinePoint time="13:00" label="Telemetry Received" active />
              <div className="w-8 h-[1px] bg-[#1E3A5F]"></div>
              <TimelinePoint time="13:02" label="Anomaly Detected" alert />
              <div className="w-8 h-[1px] bg-[#1E3A5F]"></div>
              <TimelinePoint time="13:03" label="Root Cause Identified" />
              <div className="w-8 h-[1px] bg-[#1E3A5F]"></div>
              <TimelinePoint time="13:04" label="Severity Classified" />
              <div className="w-8 h-[1px] bg-[#1E3A5F]"></div>
              <TimelinePoint time="13:05" label="Recommendation Generated" />
            </div>

            <div className="text-[10px] text-slate-500">
              Mean Delay: <span className="text-white font-bold">{metrics.detectionDelay}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Subcomponents

function NavItem({ icon, label, active, badge, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        active
          ? 'bg-[#00e5ff]/10 text-[#00e5ff] border-l-2 border-[#00e5ff] font-medium'
          : 'text-slate-400 hover:text-white hover:bg-[#0B1526]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      {badge && (
        <span className="text-[10px] font-mono px-1.5 py-0.2 bg-red-900/60 border border-red-700 text-red-300 rounded font-bold">
          {badge}
        </span>
      )}
    </div>
  );
}

function SparklineCard({ icon, label, value, delta, up, color }) {
  const sampleData = useMemo(() => Array.from({ length: 12 }, () => ({ val: 20 + Math.random() * 20 })), []);

  return (
    <div className="bg-[#060D1A] border border-[#152338] rounded-xl p-2.5 flex flex-col justify-between">
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
        <span className="flex items-center gap-1.5">
          {icon} {label}
        </span>
        <span className={up ? 'text-emerald-400 font-bold' : 'text-slate-400'}>{delta}</span>
      </div>
      <div className="text-lg font-bold text-white font-mono tracking-tight">{value}</div>
      <div className="h-7 w-full mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sampleData}>
            <Line type="monotone" dataKey="val" stroke={color} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TimelinePoint({ time, label, active, alert }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          alert ? 'bg-red-500 shadow-[0_0_8px_#ef4444]' : active ? 'bg-[#00e5ff] shadow-[0_0_8px_#00e5ff]' : 'bg-slate-600'
        }`}
      ></div>
      <div>
        <div className="text-[11px] font-bold text-white">{time}</div>
        <div className="text-[9px] text-slate-400">{label}</div>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#0A1628] border border-[#1E3A5F] p-2.5 rounded-lg shadow-xl text-xs font-mono">
        <div className="text-slate-400 text-[10px] mb-1">{data.utc}</div>
        <div className="text-[#00e5ff] font-bold">Value: {data.signal}</div>
        {data.anomalyVal && <div className="text-red-400 font-bold mt-1">Anomaly Score: {data.score} (Critical)</div>}
      </div>
    );
  }
  return null;
}
