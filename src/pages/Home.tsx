import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/providers/trpc";
import { Toaster, toast } from "sonner";
import {
  Zap, Send, Upload, Shield, Phone, Globe, Activity,
  Trash2, Play, Square, RotateCcw, FileText, CheckCircle,
  XCircle, Clock, Layers, Menu, X, MessageCircle, BarChart3
} from "lucide-react";

interface TaskStatus {
  task_id: string;
  status: string;
  current_index: number;
  total: number;
  success_count: number;
  fail_count: number;
  cancelled: boolean;
}

export default function Home() {
  const [phone, setPhone] = useState("");
  const [singleProxy, setSingleProxy] = useState("");
  const [numbersText, setNumbersText] = useState("");
  const [proxiesText, setProxiesText] = useState("");
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");
  const [tasks, setTasks] = useState<TaskStatus[]>([]);
  const [lastResult, setLastResult] = useState<any>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const proxyFileRef = useRef<HTMLInputElement>(null);

  const statusQuery = trpc.otp.status.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const sendSingle = trpc.otp.sendSingle.useMutation({
    onError: (err) => {
      toast.error("Send Failed: " + err.message);
      setLastResult({ success: false, error: err.message });
    }
  });
  const startBulk = trpc.otp.startBulk.useMutation({
    onError: (err) => {
      toast.error("Bulk Start Failed: " + err.message);
      setLastResult({ success: false, error: err.message });
    }
  });
  const cancelTask = trpc.otp.cancelTask.useMutation({
    onError: (err) => toast.error("Cancel Failed: " + err.message),
    onSuccess: () => toast.success("Task cancelled")
  });
  const parseNumbers = trpc.otp.parseNumbers.useMutation({
    onError: (err) => toast.error("Parse Failed: " + err.message)
  });
  const parseProxies = trpc.otp.parseProxies.useMutation({
    onError: (err) => toast.error("Proxy Parse Failed: " + err.message)
  });
  const utils = trpc.useUtils();

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await utils.otp.allTasks.fetch();
        if (result.success && Array.isArray(result.tasks)) {
          setTasks(result.tasks as TaskStatus[]);
        }
      } catch (e: any) {
        console.error("Task fetch error:", e.message);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [utils]);

  const handleSendSingle = useCallback(async () => {
    if (!phone.trim()) {
      toast.error("Please enter a phone number");
      return;
    }
    const toastId = toast.loading("Sending OTP...");
    try {
      const result = await sendSingle.mutateAsync({
        phone: phone.trim(),
        proxy: singleProxy.trim() || undefined,
      });
      setLastResult(result);
      if (result.success) {
        toast.success("OTP Sent Successfully!", {
          id: toastId,
          description: `${result.phone} - ${result.device_brand} ${result.device_model} - ${Number(result.time_ms || 0).toFixed(0)}ms`
        });
      } else {
        const errMsg = result.status || result.error || "Unknown error";
        toast.error("OTP Send Failed", {
          id: toastId,
          description: String(errMsg)
        });
      }
    } catch (e: any) {
      toast.error("Error: " + e.message, { id: toastId });
      setLastResult({ success: false, error: e.message });
    }
  }, [phone, singleProxy, sendSingle]);

  const handleStartBulk = useCallback(async () => {
    if (!numbersText.trim()) {
      toast.error("Please enter phone numbers");
      return;
    }
    const toastId = toast.loading("Parsing numbers...");
    try {
      const parsed = await parseNumbers.mutateAsync({ text: numbersText });
      if (!parsed.success || !parsed.numbers || (parsed.numbers as string[]).length === 0) {
        toast.error("No valid phone numbers found", { id: toastId });
        setLastResult({ success: false, error: "No valid phone numbers found" });
        return;
      }
      const count = (parsed.numbers as string[]).length;
      toast.loading(`Found ${count} numbers. Starting bulk...`, { id: toastId });

      let proxies: string[] = [];
      if (proxiesText.trim()) {
        const proxyParsed = await parseProxies.mutateAsync({ text: proxiesText });
        if (proxyParsed.success && proxyParsed.proxies) {
          proxies = proxyParsed.proxies as string[];
        }
      }

      const result = await startBulk.mutateAsync({
        phones: parsed.numbers as string[],
        proxies: proxies.length > 0 ? proxies : undefined,
      });
      setLastResult(result);
      if (result.success) {
        toast.success(`Bulk Task ${result.task_id} Started!`, {
          id: toastId,
          description: `${result.total_numbers} numbers, ${result.total_proxies || 0} proxies`
        });
      } else {
        toast.error("Failed to start bulk task", {
          id: toastId,
          description: String(result.error || "Unknown error")
        });
      }
    } catch (e: any) {
      toast.error("Bulk Error: " + e.message, { id: toastId });
      setLastResult({ success: false, error: e.message });
    }
  }, [numbersText, proxiesText, parseNumbers, parseProxies, startBulk]);

  const handleCancelTask = useCallback(async (taskId: string) => {
    try {
      await cancelTask.mutateAsync({ taskId });
      setLastResult({ success: true, message: `Task ${taskId} cancelled` });
    } catch (e: any) {
      setLastResult({ success: false, error: e.message });
    }
  }, [cancelTask]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const toastId = toast.loading("Reading file...");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      setNumbersText(text);
      try {
        const parsed = await parseNumbers.mutateAsync({ text });
        if (parsed.success) {
          toast.success(`Loaded ${parsed.count} unique numbers`, { id: toastId });
          setLastResult({ success: true, message: `Extracted ${parsed.count} unique numbers` });
        }
      } catch (e: any) {
        toast.error("Parse error: " + e.message, { id: toastId });
      }
    };
    reader.onerror = () => toast.error("Failed to read file", { id: toastId });
    reader.readAsText(file);
  }, [parseNumbers]);

  const handleProxyFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const toastId = toast.loading("Reading proxy file...");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setProxiesText(text);
      const count = text.split("\n").filter(l => l.trim() && l.includes(":")).length;
      toast.success(`Loaded ${count} proxies`, { id: toastId });
    };
    reader.onerror = () => toast.error("Failed to read proxy file", { id: toastId });
    reader.readAsText(file);
  }, []);

  const status = statusQuery.data;
  const runningTasks = tasks.filter(t => t.status === "running");

  return (
    <div className="min-h-screen bg-[#f2f2f2] text-[#111111] font-sans">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            fontFamily: "'Satoshi', sans-serif",
            fontSize: "13px",
          },
        }}
      />

      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-[#f2f2f2]/90 backdrop-blur-[12px] border-b border-[#1e1e1e]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#111111] flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#f2f2f2]" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl tracking-[-0.04em] leading-none">MUDASIR</h1>
              <p className="text-[10px] uppercase tracking-[0.15em] text-[#838282] leading-none mt-0.5">OTP SENDER</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <a href="#send" className="text-xs uppercase tracking-[0.1em] text-[#838282] hover:text-[#111111] transition-colors">Send</a>
            <a href="#bulk" className="text-xs uppercase tracking-[0.1em] text-[#838282] hover:text-[#111111] transition-colors">Bulk</a>
            <a href="#tasks" className="text-xs uppercase tracking-[0.1em] text-[#838282] hover:text-[#111111] transition-colors">Tasks</a>
            <a href="https://wa.me/923099003842" target="_blank" rel="noopener noreferrer" className="btn-pill flex items-center gap-2 text-xs">
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp
            </a>
          </nav>

          <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#1e1e1e]/10 bg-[#f2f2f2] px-4 py-4 space-y-3">
            <a href="#send" onClick={() => setMobileMenuOpen(false)} className="block text-sm uppercase tracking-[0.1em] text-[#838282]">Send OTP</a>
            <a href="#bulk" onClick={() => setMobileMenuOpen(false)} className="block text-sm uppercase tracking-[0.1em] text-[#838282]">Bulk OTP</a>
            <a href="#tasks" onClick={() => setMobileMenuOpen(false)} className="block text-sm uppercase tracking-[0.1em] text-[#838282]">Tasks</a>
            <a href="https://wa.me/923099003842" target="_blank" rel="noopener noreferrer" className="block text-sm uppercase tracking-[0.1em] text-[#838282]">WhatsApp</a>
          </div>
        )}
      </header>

      {/* HERO */}
      <section className="relative pt-16 sm:pt-24 pb-12 sm:pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="relative text-center mb-8">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <span className="text-[12vw] sm:text-[11vw] font-bold tracking-[-0.05em] leading-[0.9] text-[#bfbfbf]" style={{ transform: "translate(-0.16em, -0.16em)" }}>MUDASIR</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <span className="text-[12vw] sm:text-[11vw] font-bold tracking-[-0.05em] leading-[0.9] text-[#c9c9c9]" style={{ transform: "translate(-0.12em, -0.12em)" }}>MUDASIR</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <span className="text-[12vw] sm:text-[11vw] font-bold tracking-[-0.05em] leading-[0.9] text-[#d1d1d1]" style={{ transform: "translate(-0.08em, -0.08em)" }}>MUDASIR</span>
            </div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
              <span className="text-[12vw] sm:text-[11vw] font-bold tracking-[-0.05em] leading-[0.9] text-[#d9d9d9]" style={{ transform: "translate(-0.04em, -0.04em)" }}>MUDASIR</span>
            </div>
            <h2 className="relative text-[12vw] sm:text-[11vw] font-bold tracking-[-0.05em] leading-[0.9] text-[#111111]">MUDASIR</h2>
          </div>

          <p className="text-center text-[#838282] text-sm sm:text-base max-w-lg mx-auto leading-relaxed mb-8">
            Professional CapCut OTP Sender with SignerPy integration.
            <br className="hidden sm:block" />
            Fresh device identity per request. Proxy support. Ultra fast.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-xs uppercase tracking-[0.1em] text-[#838282]">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${status?.signerpy_available ? "bg-green-500" : "bg-red-500"} ${status?.signerpy_available ? "pulse-dot" : ""}`} />
              <span>{status?.signerpy_available ? "SignerPy Active" : "SignerPy Offline"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>{String(status?.pakistan_time || "--")}</span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{(status?.ids_generated as number) || 0} IDs</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" />
              <span>{runningTasks.length} Running</span>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {/* Tabs */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex border border-[#1e1e1e]/10 rounded-full p-1 bg-white/50">
            <button onClick={() => setActiveTab("single")} className={`px-6 sm:px-8 py-2.5 rounded-full text-xs sm:text-sm uppercase tracking-[0.1em] transition-all duration-500 ${activeTab === "single" ? "bg-[#111111] text-[#f2f2f2]" : "text-[#838282] hover:text-[#111111]"}`}>
              <span className="flex items-center gap-2"><Phone className="w-4 h-4" />Single OTP</span>
            </button>
            <button onClick={() => setActiveTab("bulk")} className={`px-6 sm:px-8 py-2.5 rounded-full text-xs sm:text-sm uppercase tracking-[0.1em] transition-all duration-500 ${activeTab === "bulk" ? "bg-[#111111] text-[#f2f2f2]" : "text-[#838282] hover:text-[#111111]"}`}>
              <span className="flex items-center gap-2"><Layers className="w-4 h-4" />Bulk OTP</span>
            </button>
          </div>
        </div>

        {/* SINGLE */}
        {activeTab === "single" && (
          <section id="send" className="max-w-xl mx-auto">
            <div className="card-border rounded-lg p-6 sm:p-8 bg-white/30">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center"><Send className="w-5 h-5 text-[#f2f2f2]" /></div>
                <div>
                  <h3 className="text-xl tracking-[-0.03em]">Single OTP</h3>
                  <p className="text-xs text-[#838282] uppercase tracking-[0.1em]">Send to one number</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-[0.1em] text-[#838282] mb-2">Phone Number</label>
                  <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1234567890"
                    className="w-full px-4 py-3 bg-white border border-[#1e1e1e]/10 rounded-lg text-sm font-mono placeholder:text-[#b6b5b5] focus:outline-none focus:border-[#111111] transition-colors" />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-[0.1em] text-[#838282] mb-2">Proxy (Optional)</label>
                  <input type="text" value={singleProxy} onChange={(e) => setSingleProxy(e.target.value)} placeholder="ip:port or ip:port:user:pass"
                    className="w-full px-4 py-3 bg-white border border-[#1e1e1e]/10 rounded-lg text-sm font-mono placeholder:text-[#b6b5b5] focus:outline-none focus:border-[#111111] transition-colors" />
                </div>
                <button onClick={handleSendSingle} disabled={sendSingle.isPending || !phone.trim()}
                  className="w-full btn-pill bg-[#111111] text-[#f2f2f2] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                  {sendSingle.isPending ? <RotateCcw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sendSingle.isPending ? "Sending..." : "Send OTP"}
                </button>
              </div>
            </div>

            {lastResult && activeTab === "single" && (
              <div className={`mt-4 card-border rounded-lg p-5 ${lastResult.success ? "bg-green-50/50 border-green-200" : "bg-red-50/50 border-red-200"}`}>
                <div className="flex items-center gap-2 mb-3">
                  {lastResult.success ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-600" />}
                  <span className="text-sm font-medium">{lastResult.success ? "Success" : "Failed"}</span>
                </div>
                {lastResult.phone && <p className="text-xs font-mono text-[#838282] mb-1">Phone: {lastResult.phone}</p>}
                {lastResult.status && <p className="text-xs text-[#838282] mb-1">Status: {lastResult.status}</p>}
                {lastResult.time_ms && <p className="text-xs text-[#838282] mb-1">Time: {Number(lastResult.time_ms).toFixed(2)}ms</p>}
                {lastResult.device_brand && <p className="text-xs text-[#838282] mb-1">Device: {lastResult.device_brand} {lastResult.device_model}</p>}
                {lastResult.error && <p className="text-xs text-red-600">{String(lastResult.error)}</p>}
              </div>
            )}
          </section>
        )}

        {/* BULK */}
        {activeTab === "bulk" && (
          <section id="bulk" className="max-w-3xl mx-auto space-y-6">
            <div className="card-border rounded-lg p-6 sm:p-8 bg-white/30">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center"><FileText className="w-5 h-5 text-[#f2f2f2]" /></div>
                  <div>
                    <h3 className="text-xl tracking-[-0.03em]">Phone Numbers</h3>
                    <p className="text-xs text-[#838282] uppercase tracking-[0.1em]">One per line or comma separated</p>
                  </div>
                </div>
                <button onClick={() => fileInputRef.current?.click()} className="btn-pill text-xs flex items-center gap-2 py-2 px-4">
                  <Upload className="w-3.5 h-3.5" />Upload File
                </button>
                <input ref={fileInputRef} type="file" accept=".txt,.csv" onChange={handleFileUpload} className="hidden" />
              </div>
              <textarea value={numbersText} onChange={(e) => setNumbersText(e.target.value)}
                placeholder={"+1234567890\n+923001234567\n+447912345678"}
                className="w-full h-40 sm:h-48 px-4 py-3 bg-white border border-[#1e1e1e]/10 rounded-lg text-sm font-mono placeholder:text-[#b6b5b5] focus:outline-none focus:border-[#111111] transition-colors resize-none" />
              {numbersText && (
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-[#838282]">{(numbersText.match(/[\+]?[\d\s\-\(\)]{10,20}/g) || []).length} potential numbers</p>
                  <button onClick={() => setNumbersText("")} className="text-xs text-[#838282] hover:text-red-600 flex items-center gap-1 transition-colors"><Trash2 className="w-3 h-3" />Clear</button>
                </div>
              )}
            </div>

            <div className="card-border rounded-lg p-6 sm:p-8 bg-white/30">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center"><Shield className="w-5 h-5 text-[#f2f2f2]" /></div>
                  <div>
                    <h3 className="text-xl tracking-[-0.03em]">Proxies</h3>
                    <p className="text-xs text-[#838282] uppercase tracking-[0.1em]">Optional - ip:port format</p>
                  </div>
                </div>
                <button onClick={() => proxyFileRef.current?.click()} className="btn-pill text-xs flex items-center gap-2 py-2 px-4">
                  <Upload className="w-3.5 h-3.5" />Upload File
                </button>
                <input ref={proxyFileRef} type="file" accept=".txt" onChange={handleProxyFileUpload} className="hidden" />
              </div>
              <textarea value={proxiesText} onChange={(e) => setProxiesText(e.target.value)}
                placeholder={"proxy.example.com:8080\nuser:pass@proxy.com:3128\nhttp://proxy.com:8080"}
                className="w-full h-24 sm:h-32 px-4 py-3 bg-white border border-[#1e1e1e]/10 rounded-lg text-sm font-mono placeholder:text-[#b6b5b5] focus:outline-none focus:border-[#111111] transition-colors resize-none" />
              {proxiesText && (
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-[#838282]">{proxiesText.split("\n").filter(l => l.trim() && l.includes(":")).length} proxies loaded</p>
                  <button onClick={() => setProxiesText("")} className="text-xs text-[#838282] hover:text-red-600 flex items-center gap-1 transition-colors"><Trash2 className="w-3 h-3" />Clear</button>
                </div>
              )}
            </div>

            <button onClick={handleStartBulk} disabled={startBulk.isPending || !numbersText.trim()}
              className="w-full btn-pill bg-[#111111] text-[#f2f2f2] flex items-center justify-center gap-2 py-4 text-base disabled:opacity-40 disabled:cursor-not-allowed">
              {startBulk.isPending ? <RotateCcw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              {startBulk.isPending ? "Starting Bulk Task..." : "Start Bulk OTP"}
            </button>

            {lastResult && activeTab === "bulk" && (
              <div className={`card-border rounded-lg p-5 ${lastResult.success ? "bg-green-50/50 border-green-200" : lastResult.error ? "bg-red-50/50 border-red-200" : "bg-white/30"}`}>
                <div className="flex items-center gap-2 mb-2">
                  {lastResult.success ? <CheckCircle className="w-5 h-5 text-green-600" /> : lastResult.error ? <XCircle className="w-5 h-5 text-red-600" /> : <Activity className="w-5 h-5 text-amber-600" />}
                  <span className="text-sm font-medium">{lastResult.success ? "Task Started" : lastResult.error ? "Error" : "Info"}</span>
                </div>
                {lastResult.task_id && <p className="text-xs font-mono text-[#838282]">Task: {lastResult.task_id}</p>}
                {lastResult.total_numbers !== undefined && <p className="text-xs text-[#838282]">Numbers: {lastResult.total_numbers}</p>}
                {lastResult.message && <p className="text-xs text-[#838282]">{String(lastResult.message)}</p>}
                {lastResult.error && <p className="text-xs text-red-600">{String(lastResult.error)}</p>}
              </div>
            )}
          </section>
        )}

        {/* TASKS */}
        <section id="tasks" className="mt-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-[#111111] flex items-center justify-center"><Activity className="w-5 h-5 text-[#f2f2f2]" /></div>
            <div>
              <h3 className="text-2xl tracking-[-0.03em]">Task Monitor</h3>
              <p className="text-xs text-[#838282] uppercase tracking-[0.1em]">Live task tracking</p>
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="card-border rounded-lg p-12 text-center bg-white/30">
              <Activity className="w-10 h-10 text-[#b6b5b5] mx-auto mb-4" />
              <p className="text-sm text-[#838282]">No tasks yet. Start a bulk OTP to see tasks here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.slice().reverse().map((task) => {
                const progress = task.total > 0 ? (task.current_index / task.total) * 100 : 0;
                return (
                  <div key={task.task_id} className="card-border rounded-lg p-4 sm:p-5 bg-white/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono uppercase tracking-wider text-[#838282]">{task.task_id}</span>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-wider font-medium ${task.status === "running" ? "bg-green-100 text-green-700" : task.status === "completed" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${task.status === "running" ? "bg-green-500 pulse-dot" : task.status === "completed" ? "bg-blue-500" : "bg-red-500"}`} />
                          {task.status}
                        </span>
                      </div>
                      {task.status === "running" && (
                        <button onClick={() => handleCancelTask(task.task_id)} className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1 transition-colors"><Square className="w-3 h-3" />Stop</button>
                      )}
                    </div>
                    <div className="mb-2"><div className="h-1.5 bg-[#d9d9d9] rounded-full overflow-hidden"><div className="h-full bg-[#111111] rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} /></div></div>
                    <div className="flex items-center justify-between text-xs text-[#838282]">
                      <span>{task.current_index} / {task.total}</span>
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3 h-3" />{task.success_count}</span>
                        <span className="flex items-center gap-1 text-red-600"><XCircle className="w-3 h-3" />{task.fail_count}</span>
                        <span>{progress.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-[#1e1e1e] text-[#f6f6f6]/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-[#f6f6f6] flex items-center justify-center"><Zap className="w-5 h-5 text-[#1e1e1e]" /></div>
                <div>
                  <h4 className="text-lg text-[#f6f6f6] tracking-[-0.03em]">MUDASIR</h4>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-[#f6f6f6]/40">OTP SENDER</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed">Professional CapCut OTP sending service with SignerPy integration and proxy support.</p>
            </div>
            <div>
              <h5 className="text-xs uppercase tracking-[0.15em] text-[#f6f6f6]/40 mb-4">Navigation</h5>
              <ul className="space-y-3 text-sm">
                <li><a href="#send" className="hover:text-[#f6f6f6] transition-colors">Single OTP</a></li>
                <li><a href="#bulk" className="hover:text-[#f6f6f6] transition-colors">Bulk OTP</a></li>
                <li><a href="#tasks" className="hover:text-[#f6f6f6] transition-colors">Task Monitor</a></li>
              </ul>
            </div>
            <div>
              <h5 className="text-xs uppercase tracking-[0.15em] text-[#f6f6f6]/40 mb-4">Features</h5>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2"><Zap className="w-3.5 h-3.5" /><span>50+ Concurrent</span></li>
                <li className="flex items-center gap-2"><Shield className="w-3.5 h-3.5" /><span>Proxy Support</span></li>
                <li className="flex items-center gap-2"><Globe className="w-3.5 h-3.5" /><span>Fresh Device ID</span></li>
              </ul>
            </div>
            <div>
              <h5 className="text-xs uppercase tracking-[0.15em] text-[#f6f6f6]/40 mb-4">Contact</h5>
              <ul className="space-y-3 text-sm">
                <li><a href="https://wa.me/923099003842" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-green-400 transition-colors"><MessageCircle className="w-4 h-4" />+92 309 9003842</a></li>
                <li className="flex items-center gap-2 text-[#f6f6f6]/40"><Clock className="w-3.5 h-3.5" /><span>Pakistan Time (PKT)</span></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#f6f6f6]/30">&copy; {new Date().getFullYear()} MUDASIR. All rights reserved.</p>
            <p className="text-xs text-[#f6f6f6]/30">Powered by SignerPy &middot; CapCut API &middot; Type 3635</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
