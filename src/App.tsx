import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import QRCode from "qrcode";
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, CheckCircle2, Clipboard, ExternalLink, FilePlus2, FileSearch, FileText, Link2, LoaderCircle, Search, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { amountToUnits, createRequest, decodeRequest, isExpired, normalizeAddress, requestSchema, requestUrl, verifyRequestFingerprint, type PactRequest } from "./lib/pact";
import { CHAIN_ID, EXPLORER, RECEIPT_ADDRESS, readReceipt, type ReceiptSnapshot } from "./lib/chain";

type View = "requests" | "create" | "verify";
type Filter = "all" | "open" | "expired";
const storeKey = `pact:requests:${CHAIN_ID}:${RECEIPT_ADDRESS.toLowerCase()}`;
const blankForm = { title: "", merchant: "", recipient: "", asset: "BOT", tokenAddress: "", decimals: "18", amount: "", deadline: "", note: "" };

function viewFromUrl(): View {
  if (new URLSearchParams(location.search).has("request")) return "verify";
  const view = new URLSearchParams(location.search).get("view");
  return view === "create" || view === "verify" ? view : "requests";
}
function updateUrl(view: View, request?: PactRequest) {
  const url = new URL(location.href);
  url.search = "";
  if (request) url.searchParams.set("request", btoa(unescape(encodeURIComponent(JSON.stringify(request)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""));
  else if (view !== "requests") url.searchParams.set("view", view);
  history.pushState({}, "", url);
}
function readStored(): PactRequest[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storeKey) || "[]");
    return Array.isArray(value) ? value.map((item) => requestSchema.parse(item)) : [];
  } catch { return []; }
}
function short(value: string, head = 7, tail = 5) { return `${value.slice(0, head)}…${value.slice(-tail)}`; }
function dateLabel(value: string) { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)); }
function toLocalInput(date: Date) { const d = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); }
function IconButton({ label, children, onClick, disabled = false }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button className="icon-button" type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}

export default function App() {
  const [view, setView] = useState<View>(viewFromUrl);
  const [requests, setRequests] = useState<PactRequest[]>(readStored);
  const [selected, setSelected] = useState<PactRequest | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState("");

  useEffect(() => { localStorage.setItem(storeKey, JSON.stringify(requests)); }, [requests]);
  useEffect(() => {
    const onPop = () => {
      setView(viewFromUrl());
      const encoded = new URLSearchParams(location.search).get("request");
      try { setSelected(encoded ? decodeRequest(encoded) : null); } catch { setSelected(null); }
    };
    onPop(); window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (next: View) => { setView(next); setSelected(null); setNotice(""); updateUrl(next); };
  const openRequest = (request: PactRequest) => { setSelected(request); setView("verify"); updateUrl("verify", request); setNotice(""); };
  const addRequest = (request: PactRequest) => { setRequests((current) => [request, ...current.filter((r) => r.requestId !== request.requestId)]); openRequest(request); };

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => go("requests")} aria-label="Pact requests">
        <span className="brand-mark"><img src="/pact-mark.svg" alt="" /></span><span className="brand-name">Pact</span>
      </button>
      <nav className="main-nav" aria-label="Main workflows">
        {([ ["requests", "Requests", FileText], ["create", "Create", FilePlus2], ["verify", "Verify", ShieldCheck] ] as const).map(([id, label, Icon]) => <button key={id} className={view === id ? "nav-item active" : "nav-item"} aria-current={view === id ? "page" : undefined} onClick={() => go(id)}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></button>)}
      </nav>
      <a className="network-pill" href={`${EXPLORER}/address/${RECEIPT_ADDRESS}`} target="_blank" rel="noreferrer"><span className="network-dot" />BOT testnet <span className="chain-number">{CHAIN_ID}</span><ArrowUpRight size={14} /></a>
    </header>

    <main className="workspace">
      {notice && <div className="notice" role="status"><Check size={16} />{notice}<IconButton label="Dismiss" onClick={() => setNotice("")}><X size={15} /></IconButton></div>}
      {view === "requests" && <RequestsView requests={requests} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} onCreate={() => go("create")} onOpen={openRequest} />}
      {view === "create" && <CreateView onCreate={addRequest} onCancel={() => go("requests")} />}
      {view === "verify" && <VerifyView request={selected} onSetRequest={setSelected} onBack={() => go("requests")} onNotice={setNotice} />}
    </main>
    <footer><span>Pact <span className="footer-sep">·</span> BOT Chain Testnet</span><span>Requests are local until you share them. A PactReceipt is not a payment.</span><a href="https://scan.bohr.life/address/0x26a01c58a44fd3d8F57E61FE388EDC527a052C6d" target="_blank" rel="noreferrer">Verified receipt contract <ExternalLink size={13} /></a></footer>
  </div>;
}

function RequestsView({ requests, search, setSearch, filter, setFilter, onCreate, onOpen }: { requests: PactRequest[]; search: string; setSearch: (s: string) => void; filter: Filter; setFilter: (f: Filter) => void; onCreate: () => void; onOpen: (r: PactRequest) => void }) {
  const visible = requests.filter((r) => {
    const expired = isExpired(r);
    const matchesFilter = filter === "all" || (filter === "open" && !expired) || (filter === "expired" && expired);
    const q = search.trim().toLowerCase();
    return matchesFilter && (!q || [r.title, r.merchant, r.recipient, r.asset].some((v) => v.toLowerCase().includes(q)));
  });
  const exportCsv = () => {
    const cells = [["Title", "Merchant", "Recipient", "Asset", "Amount", "Deadline", "Request fingerprint", "Status"], ...visible.map((r) => [r.title, r.merchant, r.recipient, `${r.asset}${r.tokenAddress ? ` ${r.tokenAddress}` : " (native)"}`, r.amount, r.deadline, r.requestId, isExpired(r) ? "Expired" : "Open"])]
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const href = URL.createObjectURL(new Blob([cells], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = href; a.download = "pact-requests.csv"; a.click(); URL.revokeObjectURL(href);
  };
  return <section className="page requests-page">
    <div className="page-heading"><div><h1>Your requests</h1><p>Payment links you created in this browser. No request is marked paid.</p></div><button className="button primary" onClick={onCreate}><FilePlus2 size={17} />New request</button></div>
    <div className="toolbar">
      <label className="searchbox"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, merchant, address" aria-label="Search requests" /></label>
      <div className="filter-group" aria-label="Filter requests">{(["all", "open", "expired"] as const).map((key) => <button key={key} onClick={() => setFilter(key)} className={filter === key ? "filter active" : "filter"}>{key === "all" ? "All" : key === "open" ? "Open" : "Expired"}</button>)}</div>
      <IconButton label="Export visible requests as CSV" onClick={exportCsv} disabled={!visible.length}><ArrowDownToLine size={17} /></IconButton>
    </div>
    <div className="request-table-wrap"><table className="request-table"><thead><tr><th>Request</th><th>Amount</th><th>Recipient</th><th>Expires</th><th>State</th><th><span className="sr-only">Open request</span></th></tr></thead><tbody>
      {visible.map((r) => <tr key={r.requestId} tabIndex={0} onClick={() => onOpen(r)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(r); }}>
        <td><div className="request-name"><span className="document-icon"><FileText size={17} /></span><span><strong>{r.title}</strong><small>{r.merchant} <i>·</i> {short(r.requestId, 9, 4)}</small></span></div></td>
        <td className="amount-cell">{r.amount} <span>{r.asset}</span></td><td className="mono">{short(r.recipient)}</td><td>{dateLabel(r.deadline)}</td>
        <td><span className={isExpired(r) ? "state-tag expired" : "state-tag open"}><i />{isExpired(r) ? "Expired" : "Open"}</span></td><td><ArrowUpRight size={16} className="row-arrow" /></td>
      </tr>)}
    </tbody></table>
      {!visible.length && <div className="empty-state"><div className="empty-icon"><FileSearch size={23} /></div><h2>{requests.length ? "No requests match" : "Nothing here yet"}</h2><p>{requests.length ? "Try a different search or filter." : "Create a fixed request, review its details, then share the link. Requests stay on this device unless you share them."}</p>{!requests.length && <button className="button primary" onClick={onCreate}><FilePlus2 size={17} />Create your first request</button>}</div>}
    </div>
    <div className="local-note"><span className="note-mark">i</span><p><strong>Local by design.</strong> This list is saved in this browser only. A shared link contains its request details and can be opened without an account.</p></div>
  </section>;
}

function CreateView({ onCreate, onCancel }: { onCreate: (r: PactRequest) => void; onCancel: () => void }) {
  const [form, setForm] = useState(() => ({ ...blankForm, deadline: toLocalInput(new Date(Date.now() + 7 * 86_400_000)) }));
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof blankForm, value: string) => setForm((old) => ({ ...old, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const deadline = new Date(form.deadline).toISOString();
      if (Date.parse(deadline) <= Date.now()) throw new Error("Choose an expiry time in the future.");
      const seed = { version: 1 as const, title: form.title, merchant: form.merchant, recipient: normalizeAddress(form.recipient), asset: form.asset, tokenAddress: form.tokenAddress.trim() ? normalizeAddress(form.tokenAddress) : null, decimals: Number(form.decimals), amount: form.amount, deadline, note: form.note, createdAt: new Date().toISOString() };
      const request = await createRequest(seed); onCreate(request);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Check the request details and try again."); }
    finally { setBusy(false); }
  }
  return <section className="page create-page">
    <button className="back-button" onClick={onCancel}><ArrowLeft size={16} />Back to requests</button>
    <div className="create-grid"><div className="form-column"><div className="page-heading compact"><div><h1>Create a request</h1><p>Fix the amount and destination before sharing.</p></div></div>
      <form className="request-form" onSubmit={submit}>
        <div className="form-section"><div className="section-heading"><span>01</span><div><h2>What is this for?</h2><p>These details identify the request to its recipient.</p></div></div>
          <label>Request name<input required minLength={3} maxLength={72} value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Community dinner contribution" /></label>
          <label>Merchant or organizer<input required minLength={2} maxLength={60} value={form.merchant} onChange={(e) => update("merchant", e.target.value)} placeholder="Your shop or group name" /></label>
          <label>Purpose note <span className="optional">Optional</span><textarea maxLength={240} value={form.note} onChange={(e) => update("note", e.target.value)} placeholder="Add useful context for the person paying." /></label>
        </div>
        <div className="form-section"><div className="section-heading"><span>02</span><div><h2>Set the amount</h2><p>The label and precision are supplied by you; Pact does not query token metadata.</p></div></div>
          <div className="field-row"><label>Asset label<input required value={form.asset} maxLength={12} onChange={(e) => update("asset", e.target.value)} placeholder="BOT" /></label><label>Amount<input required inputMode="decimal" value={form.amount} onChange={(e) => update("amount", e.target.value)} placeholder="25.00" /></label><label>Decimals<input required type="number" min="0" max="18" value={form.decimals} onChange={(e) => update("decimals", e.target.value)} /></label></div>
          <label>Token contract address <span className="optional">Optional for native BOT</span><input spellCheck={false} autoComplete="off" value={form.tokenAddress} onChange={(e) => update("tokenAddress", e.target.value)} placeholder="0x… (required for ERC-20 assets)" /></label>
          <p className="field-help">Pact does not look up or certify this asset label or contract. Native BOT requests have no token contract address and cannot match this ERC-20-style receipt anchor.</p>
        </div>
        <div className="form-section"><div className="section-heading"><span>03</span><div><h2>Where and when?</h2><p>Recipients can compare these exact fields with the deployed receipt.</p></div></div>
          <label>Recipient address<input required spellCheck={false} autoComplete="off" value={form.recipient} onChange={(e) => update("recipient", e.target.value)} placeholder="0x…" /></label>
          <label>Request expires<input required type="datetime-local" value={form.deadline} onChange={(e) => update("deadline", e.target.value)} /></label>
        </div>
        {error && <p className="form-error" role="alert"><TriangleAlert size={16} />{error}</p>}
        <div className="form-actions"><button className="button quiet" type="button" onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <Link2 size={17} />}{busy ? "Preparing link…" : "Create payment link"}</button></div>
      </form>
    </div><aside className="create-aside"><img className="paper-art" src="/pact-paper.png" alt="A paper invoice and leaf on a light desk" /><div className="aside-copy"><span className="verified-kicker"><ShieldCheck size={15} />REQUEST INTEGRITY</span><h2>A fixed request, ready to share.</h2><p>Pact creates a deterministic fingerprint over the details you enter. This is an integrity check, not a signature or proof that the payment happened.</p></div></aside></div>
  </section>;
}

function VerifyView({ request, onSetRequest, onBack, onNotice }: { request: PactRequest | null; onSetRequest: (r: PactRequest | null) => void; onBack: () => void; onNotice: (s: string) => void }) {
  const [input, setInput] = useState(""); const [fingerprintOk, setFingerprintOk] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<ReceiptSnapshot | null>(null); const [readError, setReadError] = useState(""); const [reading, setReading] = useState(false);
  const [payer, setPayer] = useState(""); const [qr, setQr] = useState(""); const [copied, setCopied] = useState(false);
  const url = useMemo(() => request ? requestUrl(request) : "", [request]);
  useEffect(() => { let live = true; if (request) void verifyRequestFingerprint(request).then((ok) => { if (live) setFingerprintOk(ok); }); else setFingerprintOk(null); return () => { live = false; }; }, [request]);
  useEffect(() => { let live = true; if (url) void QRCode.toDataURL(url, { width: 196, margin: 1, color: { dark: "#242626", light: "#fcfcfc" }, errorCorrectionLevel: "M" }).then((value) => { if (live) setQr(value); }).catch(() => { if (live) setQr(""); }); else setQr(""); return () => { live = false; }; }, [url]);
  const loadLink = () => {
    try { const value = input.trim(); const encoded = value.includes("request=") ? new URL(value).searchParams.get("request") : value; if (!encoded) throw new Error("Paste a Pact request URL or request payload."); onSetRequest(decodeRequest(encoded)); setReadError(""); setSnapshot(null); }
    catch (cause) { setReadError(cause instanceof Error ? cause.message : "This link could not be read."); }
  };
  const loadReceipt = async () => {
    setReading(true); setReadError(""); setSnapshot(null);
    try { setSnapshot(await readReceipt()); }
    catch (cause) { setReadError(cause instanceof Error ? cause.message : "The BOT Chain receipt could not be read."); }
    finally { setReading(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); onNotice("Request link copied."); setTimeout(() => setCopied(false), 1600); } catch { setReadError("Clipboard access was blocked. Select and copy the request URL instead."); } };
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: request?.title, text: `Pact request: ${request?.title}`, url }); } catch { /* user cancelled */ } } else void copy(); };

  if (!request) return <section className="page verify-page"><div className="page-heading"><div><h1>Check a request</h1><p>Open a shared link or paste it below. Reads do not require a wallet.</p></div></div>
    <div className="link-loader"><div className="empty-icon"><FileSearch size={23} /></div><label htmlFor="request-link">Pact request link</label><div className="load-row"><input id="request-link" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste a Pact URL or payload" onKeyDown={(e) => { if (e.key === "Enter") loadLink(); }} /><button className="button primary" onClick={loadLink}>Open request</button></div>{readError && <p className="form-error" role="alert"><TriangleAlert size={16} />{readError}</p>}<p>Links are encoded in the URL. Pact stores them in this browser only when you create them here.</p></div>
    <div className="anchor-intro"><div><span className="verified-kicker"><ShieldCheck size={15} />DEPLOYED ON TESTNET</span><h2>Inspect the Pact receipt anchor</h2><p>Read the immutable parameters currently stored at the verified project contract.</p></div><a className="text-link" target="_blank" rel="noreferrer" href={`${EXPLORER}/address/${RECEIPT_ADDRESS}`}>View contract <ExternalLink size={15} /></a></div>
    <ContractRead snapshot={snapshot} error={readError} reading={reading} onRead={loadReceipt} request={null} />
  </section>;

  const expiry = isExpired(request);
  const payerSelf = (() => { if (!payer.trim()) return null; try { return normalizeAddress(payer).toLowerCase() === request.recipient.toLowerCase(); } catch { return false; } })();
  return <section className="page invoice-page"><button className="back-button" onClick={onBack}><ArrowLeft size={16} />All requests</button>
    <div className="invoice-layout"><article className="invoice-paper">
      <div className="invoice-top"><span className="invoice-logo"><img src="/pact-mark.svg" alt="" />Pact</span><span className="local-badge"><i />{requestsStorageHas(request) ? "Saved on this device" : "Shared request"}</span></div>
      <div className="invoice-title"><div><span className="doc-label">PAYMENT REQUEST</span><h1>{request.title}</h1><p>{request.note || `A request from ${request.merchant}.`}</p></div></div>
      <div className="invoice-amount"><span>Amount requested</span><strong>{request.amount}<small>{request.asset}</small></strong></div>
      <div className="invoice-details"><div><span>From</span><strong>{request.merchant}</strong></div><div><span>Send to</span><strong className="mono">{request.recipient}</strong><button className="inline-copy" onClick={() => { void navigator.clipboard.writeText(request.recipient).then(() => onNotice("Recipient address copied.")); }}><Clipboard size={14} />Copy address</button></div>
        <div><span>Asset label <em>Set by requester</em></span><strong>{request.asset}</strong><small>{request.tokenAddress ?? "Native asset — no token contract supplied"}</small></div>
        <div><span>Expires</span><strong>{new Date(request.deadline).toLocaleString()}</strong><span className={expiry ? "status-expired" : "status-open"}>{expiry ? "Expired — request is closed" : "Open by local clock"}</span></div>
      </div>
      <div className="integrity-line"><span className={fingerprintOk ? "integrity-icon good" : "integrity-icon bad"}>{fingerprintOk ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}</span><div><strong>{fingerprintOk ? "Request fields match fingerprint" : "Request does not match fingerprint"}</strong><p>Deterministic integrity only; this is not a signature or a payment receipt.</p></div><code>{short(request.requestId, 10, 8)}</code></div>
      <div className="invoice-actions"><button className="button primary" onClick={() => void share()}><ArrowUpRight size={17} />Share request</button><button className="button secondary" onClick={() => void copy()}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? "Copied" : "Copy link"}</button></div>
      <div className="self-check"><label htmlFor="payer-address">Check your own address <span>Optional, manual check</span></label><input id="payer-address" value={payer} onChange={(e) => setPayer(e.target.value)} spellCheck={false} placeholder="Paste payer address to check for self-payment" />{payerSelf === true && <p className="form-error"><TriangleAlert size={15} />This matches the recipient address. Use a different payer.</p>}{payerSelf === false && payer.length > 5 && <p className="match-note"><CheckCircle2 size={15} />This address differs from the recipient. Pact has not connected to a wallet.</p>}</div>
      <p className="not-payment"><TriangleAlert size={15} />This link requests payment but does not collect, settle, or confirm one.</p>
    </article>
    <aside className="verify-aside"><div className="qr-block"><div className="qr-heading"><h2>Scan to open</h2><span>Encodes this exact URL</span></div>{qr ? <img className="qr-image" src={qr} alt="QR code for this Pact request link" /> : <div className="qr-placeholder"><LoaderCircle size={21} /></div>}<button className="text-link" onClick={() => void copy()}><Link2 size={15} />Copy request URL</button></div>
      <div className="anchor-panel"><div className="anchor-title"><span><ShieldCheck size={18} /></span><div><h2>On-chain anchor</h2><p>Read-only · BOT Chain Testnet</p></div></div><p>PactReceipt stores a recipient, token address, amount, deadline and request fingerprint. It does not transfer tokens or establish that a real-world action happened.</p><a className="contract-ref" href={`${EXPLORER}/address/${RECEIPT_ADDRESS}`} target="_blank" rel="noreferrer">{short(RECEIPT_ADDRESS, 10, 8)} <ExternalLink size={14} /></a><button className="button secondary full" onClick={loadReceipt} disabled={reading}>{reading ? <LoaderCircle size={16} className="spin" /> : <FileSearch size={16} />}{reading ? "Reading chain…" : "Compare with receipt"}</button>
        <ContractRead snapshot={snapshot} error={readError} reading={reading} onRead={loadReceipt} request={request} />
      </div>
    </aside></div>
  </section>;

}

function requestsStorageHas(request: PactRequest): boolean {
  try { const value = JSON.parse(localStorage.getItem(storeKey) || "[]") as PactRequest[]; return value.some((r) => r.requestId === request.requestId); } catch { return false; }
}

function ContractRead({ snapshot, error, reading, onRead, request }: { snapshot: ReceiptSnapshot | null; error: string; reading: boolean; onRead: () => void; request: PactRequest | null }) {
  const comparisons = useMemo(() => {
    if (!request || !snapshot) return null;
    const expectedAmount = amountToUnits(request.amount, request.decimals);
    return [
      ["Recipient", snapshot.recipient.toLowerCase() === request.recipient.toLowerCase()],
      ["Token address", request.tokenAddress !== null && snapshot.token.toLowerCase() === request.tokenAddress.toLowerCase()],
      ["Amount in base units", snapshot.amount === expectedAmount],
      ["Expiry", snapshot.deadline === BigInt(Math.floor(Date.parse(request.deadline) / 1000))],
      ["Request fingerprint", snapshot.requestId.toLowerCase() === request.requestId.toLowerCase()],
    ] as const;
  }, [request, snapshot]);
  const allMatch = comparisons?.every(([, match]) => match) ?? false;
  return <div className="chain-read">
    {snapshot ? <>
      <div className={allMatch ? "chain-result matched" : "chain-result mismatch"}><span>{allMatch ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}</span><div><strong>{request ? (allMatch ? "Exact parameter match" : "Fields do not all match") : "Receipt contract read"}</strong><p>{request ? "This confirms stored parameters only—not a payment." : "Read back from BOT Chain Testnet."}</p></div></div>
      <dl className="read-metadata"><div><dt>Chain</dt><dd>{snapshot.chainId}</dd></div><div><dt>Latest block</dt><dd>{snapshot.blockNumber.toString()}</dd></div><div><dt>Block time</dt><dd>{new Date(Number(snapshot.blockTimestamp) * 1000).toLocaleString()}</dd></div><div><dt>Contract code</dt><dd>{snapshot.code.length > 2 ? "Present" : "Missing"}</dd></div><div><dt>Recipient</dt><dd className="mono">{short(snapshot.recipient, 8, 6)}</dd></div><div><dt>Token address</dt><dd className="mono">{short(snapshot.token, 8, 6)}</dd></div><div><dt>Amount</dt><dd>{snapshot.amount.toString()} base units</dd></div><div><dt>Deadline</dt><dd>{new Date(Number(snapshot.deadline) * 1000).toLocaleString()}</dd></div><div><dt>Request ID</dt><dd className="mono">{short(snapshot.requestId, 8, 6)}</dd></div><div><dt>Open at latest block</dt><dd>{snapshot.isOpen ? "Yes" : "No"}</dd></div></dl>
      {comparisons && <ul className="compare-list">{comparisons.map(([label, match]) => <li key={label} className={match ? "compare-match" : "compare-miss"}>{match ? <Check size={14} /> : <X size={14} />}<span>{label}</span><strong>{match ? "Match" : label === "Token address" && !request.tokenAddress ? "No token contract on link" : "Different"}</strong></li>)}</ul>}
      <a className="text-link" target="_blank" rel="noreferrer" href={`${EXPLORER}/address/${RECEIPT_ADDRESS}`}>Inspect verified contract <ExternalLink size={14} /></a>
    </> : <div className="chain-idle">{error ? <p className="form-error" role="alert"><TriangleAlert size={15} />{error}</p> : <p>Nothing has been read yet. This only queries public chain data.</p>}<button className="text-link" onClick={onRead} disabled={reading}>{reading ? <LoaderCircle size={15} className="spin" /> : <FileSearch size={15} />}{reading ? "Reading…" : "Read contract now"}</button></div>}
  </div>;
}
