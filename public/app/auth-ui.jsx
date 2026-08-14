/* ============================================================
   BCCWE — Login, first-login change, forgot/reset, account menu
   Standalone screens (do not depend on the main app layout).
   ============================================================ */

const AUTH_WRAP = {
  position: "fixed", inset: 0, display: "grid", placeItems: "center",
  background: "radial-gradient(1200px 600px at 70% -10%, #fdebdc 0%, #f6f4f1 55%)", zIndex: 5000, fontFamily: "'Hanken Grotesk', system-ui, sans-serif",
  padding: 16,
};
const AUTH_CARD = {
  width: "100%", maxWidth: 380, background: "#fff", border: "1px solid #e6eaf0",
  borderRadius: 16, padding: 30, boxShadow: "0 8px 30px rgba(20,30,45,.08)",
};
const AUTH_LOGO = {
  width: 50, height: 50, background: "linear-gradient(135deg, #fb8a3c, #ea580c)", color: "#fff", display: "grid",
  placeItems: "center", borderRadius: 12, fontWeight: 800, fontSize: 22, margin: "0 auto 16px",
  boxShadow: "0 6px 16px -4px rgba(234,88,12,.5)",
};
const AUTH_INPUT = {
  width: "100%", padding: "11px 12px", border: "1px solid #d4dae2", borderRadius: 9,
  fontSize: 14, boxSizing: "border-box", marginTop: 6,
};
const AUTH_LABEL = { display: "block", fontWeight: 600, fontSize: 13, marginTop: 14, color: "#1c2530" };
const AUTH_BTN = {
  width: "100%", padding: 12, background: "linear-gradient(135deg, #fb8a3c, #ea580c)", color: "#fff", border: "none",
  borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 20,
  boxShadow: "0 6px 16px -6px rgba(234,88,12,.5)",
};
const AUTH_MSG_ERR = { marginTop: 14, padding: 11, borderRadius: 9, fontSize: 13, background: "#fdeeee", color: "#a32626", border: "1px solid #f3caca" };
const AUTH_MSG_OK = { marginTop: 14, padding: 11, borderRadius: 9, fontSize: 13, background: "#e6f6ef", color: "#c2410c", border: "1px solid #b9e4d2" };
const AUTH_LINK = { background: "none", border: "none", color: "#ea580c", cursor: "pointer", fontSize: 13, fontWeight: 600, padding: 0, marginTop: 16 };

function authPost(path, body) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  }).then(function (r) { return r.json().then(function (j) { return { status: r.status, data: j }; }); });
}

/* ---------------- Login ---------------- */
function LoginScreen() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("login"); // login | forgot

  function submit(e) {
    if (e) e.preventDefault();
    setErr(""); setBusy(true);
    authPost("/api/login", { userId: userId, password: password }).then(function (r) {
      setBusy(false);
      if (r.status === 200 && r.data.ok) {
        try { localStorage.setItem("bccwe_token", r.data.token); } catch (e) {}
        try { sessionStorage.setItem("bccwe_just_logged_in", "1"); } catch (e) {}
        location.reload();
      } else {
        setErr(r.data.error || "Sign in failed.");
      }
    }).catch(function () { setBusy(false); setErr("Could not reach the server."); });
  }

  if (view === "forgot") return <ForgotPassword onBack={() => setView("login")} />;

  return (
    <div style={AUTH_WRAP}>
      <form style={AUTH_CARD} onSubmit={submit}>
        <div style={AUTH_LOGO}>B</div>
        <h2 style={{ textAlign: "center", margin: "0 0 4px", fontSize: 19 }}>BCCWE Invoicing</h2>
        <p style={{ textAlign: "center", margin: 0, color: "#5a6877", fontSize: 13 }}>Sign in to continue</p>

        <label style={AUTH_LABEL}>User ID</label>
        <input style={AUTH_INPUT} value={userId} autoFocus onChange={(e) => setUserId(e.target.value)} autoComplete="username" />

        <label style={AUTH_LABEL}>Password</label>
        <input style={AUTH_INPUT} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

        {err && <div style={AUTH_MSG_ERR}>{err}</div>}

        <button style={Object.assign({}, AUTH_BTN, busy ? { opacity: .6 } : {})} type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div style={{ textAlign: "center" }}>
          <button type="button" style={AUTH_LINK} onClick={() => setView("forgot")}>Forgot password?</button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Forgot / reset password ---------------- */
function ForgotPassword({ onBack }) {
  const [step, setStep] = useState(1); // 1 = request code, 2 = enter code + new pw
  const [userId, setUserId] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  function requestCode(e) {
    if (e) e.preventDefault();
    setErr(""); setOk(""); setBusy(true);
    authPost("/api/forgot-password", { userId: userId }).then(function (r) {
      setBusy(false);
      if (r.data.ok) { setOk(r.data.message || "Code sent."); setStep(2); }
      else setErr(r.data.error || "Could not send a reset code.");
    }).catch(function () { setBusy(false); setErr("Could not reach the server."); });
  }
  function doReset(e) {
    if (e) e.preventDefault();
    setErr(""); setOk("");
    if (pw.length < 6) { setErr("New password must be at least 6 characters."); return; }
    if (pw !== pw2) { setErr("Passwords do not match."); return; }
    setBusy(true);
    authPost("/api/reset-password", { userId: userId, code: code, newPassword: pw }).then(function (r) {
      setBusy(false);
      if (r.data.ok) { setOk("Password reset. You can sign in now."); setStep(3); }
      else setErr(r.data.error || "Reset failed.");
    }).catch(function () { setBusy(false); setErr("Could not reach the server."); });
  }

  return (
    <div style={AUTH_WRAP}>
      <div style={AUTH_CARD}>
        <div style={AUTH_LOGO}>B</div>
        <h2 style={{ textAlign: "center", margin: "0 0 4px", fontSize: 19 }}>Reset password</h2>

        {step === 1 && (
          <form onSubmit={requestCode}>
            <p style={{ textAlign: "center", margin: "0 0 4px", color: "#5a6877", fontSize: 13 }}>
              Enter your User ID. We'll email a reset code to the address on file.
            </p>
            <label style={AUTH_LABEL}>User ID (or email)</label>
            <input style={AUTH_INPUT} value={userId} autoFocus autoComplete="username" onChange={(e) => setUserId(e.target.value)} />
            {err && <div style={AUTH_MSG_ERR}>{err}</div>}
            {ok && <div style={AUTH_MSG_OK}>{ok}</div>}
            <button style={Object.assign({}, AUTH_BTN, busy ? { opacity: .6 } : {})} type="submit" disabled={busy}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={doReset} autoComplete="off">
            <p style={{ textAlign: "center", margin: "0 0 4px", color: "#5a6877", fontSize: 13 }}>
              We emailed a 6-digit code to <strong>{userId}</strong>. Enter it below, then choose a new password.
            </p>
            <label style={AUTH_LABEL}>Verification code (from your email)</label>
            <input style={Object.assign({}, AUTH_INPUT, { letterSpacing: 4, fontSize: 18, textAlign: "center" })}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus autoComplete="one-time-code" inputMode="numeric" name="bccwe_reset_code"
              placeholder="••••••" maxLength={6} />
            <div style={{ fontSize: 12, color: "#8593a3", marginTop: 4 }}>
              Didn't get it? Check spam, or <button type="button" style={{ ...AUTH_LINK, marginTop: 0 }} onClick={() => { setStep(1); setCode(""); }}>request a new code</button>.
            </div>
            <label style={AUTH_LABEL}>New password</label>
            <input style={AUTH_INPUT} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="At least 6 characters" />
            <label style={AUTH_LABEL}>Confirm new password</label>
            <input style={AUTH_INPUT} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
            {err && <div style={AUTH_MSG_ERR}>{err}</div>}
            {ok && <div style={AUTH_MSG_OK}>{ok}</div>}
            <button style={Object.assign({}, AUTH_BTN, busy ? { opacity: .6 } : {})} type="submit" disabled={busy}>
              {busy ? "Resetting…" : "Reset password"}
            </button>
          </form>
        )}

        {step === 3 && <div style={AUTH_MSG_OK}>{ok}</div>}

        <div style={{ textAlign: "center" }}>
          <button type="button" style={AUTH_LINK} onClick={onBack}>← Back to sign in</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- First-login: set ID, password, email ---------------- */
function ForceChange() {
  const locked = !!(window.__session && window.__session.idLocked);
  const [userId, setUserId] = useState((window.__session && window.__session.userId) || "");
  const [email, setEmail] = useState((window.__session && window.__session.email) || "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(e) {
    if (e) e.preventDefault();
    setErr("");
    if (!locked && !userId.trim()) { setErr("Please choose a User ID."); return; }
    if (pw.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (pw !== pw2) { setErr("Passwords do not match."); return; }
    if (!email.trim()) { setErr("Please enter an email (needed for password resets)."); return; }
    setBusy(true);
    authPost("/api/change-credentials", { newUserId: userId.trim(), newPassword: pw, email: email.trim() }).then(function (r) {
      setBusy(false);
      if (r.data.ok) { location.reload(); }
      else setErr(r.data.error || "Could not save.");
    }).catch(function () { setBusy(false); setErr("Could not reach the server."); });
  }

  return (
    <div style={AUTH_WRAP}>
      <form style={AUTH_CARD} onSubmit={submit}>
        <div style={AUTH_LOGO}>B</div>
        <h2 style={{ textAlign: "center", margin: "0 0 4px", fontSize: 19 }}>Set up your account</h2>
        <p style={{ textAlign: "center", margin: 0, color: "#5a6877", fontSize: 13 }}>
          First sign-in — choose your own login details.
        </p>

        <label style={AUTH_LABEL}>User ID {locked && <span style={{ color: "#8593a3", fontWeight: 500 }}>(locked)</span>}</label>
        <input style={Object.assign({}, AUTH_INPUT, locked ? { background: "#f3f5f8", color: "#8593a3" } : {})}
          value={userId} disabled={locked} onChange={(e) => setUserId(e.target.value)} />
        {!locked && <div style={{ fontSize: 12, color: "#8593a3", marginTop: 4 }}>You can only set this once — it locks after saving.</div>}

        <label style={AUTH_LABEL}>New password</label>
        <input style={AUTH_INPUT} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 6 characters" />

        <label style={AUTH_LABEL}>Confirm password</label>
        <input style={AUTH_INPUT} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />

        <label style={AUTH_LABEL}>Recovery email</label>
        <input style={AUTH_INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourbusiness.com" />
        <div style={{ fontSize: 12, color: "#8593a3", marginTop: 4 }}>Used to reset your password if you forget it.</div>

        {err && <div style={AUTH_MSG_ERR}>{err}</div>}
        <button style={Object.assign({}, AUTH_BTN, busy ? { opacity: .6 } : {})} type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save & continue"}
        </button>
      </form>
    </div>
  );
}

/* ---------------- Change password modal (from Account menu) ---------------- */
function ChangePasswordModal({ onClose }) {
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  function submit(e) {
    if (e) e.preventDefault();
    setErr(""); setOk("");
    if (pw.length < 6) { setErr("New password must be at least 6 characters."); return; }
    if (pw !== pw2) { setErr("Passwords do not match."); return; }
    setBusy(true);
    authPost("/api/change-password", { currentPassword: cur, newPassword: pw }).then(function (r) {
      setBusy(false);
      if (r.data.ok) { setOk("Password changed."); setCur(""); setPw(""); setPw2(""); }
      else setErr(r.data.error || "Could not change password.");
    }).catch(function () { setBusy(false); setErr("Could not reach the server."); });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,30,45,.45)", display: "grid", placeItems: "center", zIndex: 6000 }} onClick={onClose}>
      <form style={Object.assign({}, AUTH_CARD, { maxWidth: 360 })} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Change password</h2>
        <label style={AUTH_LABEL}>Current password</label>
        <input style={AUTH_INPUT} type="password" value={cur} onChange={(e) => setCur(e.target.value)} />
        <label style={AUTH_LABEL}>New password</label>
        <input style={AUTH_INPUT} type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <label style={AUTH_LABEL}>Confirm new password</label>
        <input style={AUTH_INPUT} type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {err && <div style={AUTH_MSG_ERR}>{err}</div>}
        {ok && <div style={AUTH_MSG_OK}>{ok}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button type="button" style={{ flex: 1, padding: 11, background: "#eef1f5", border: "none", borderRadius: 9, fontWeight: 600, cursor: "pointer" }} onClick={onClose}>Close</button>
          <button type="submit" style={Object.assign({}, AUTH_BTN, { marginTop: 0, flex: 1, opacity: busy ? .6 : 1 })} disabled={busy}>{busy ? "Saving…" : "Change"}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Account menu for the top bar ---------------- */
function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const userId = (window.__session && window.__session.userId) || "User";
  const initials = userId.slice(0, 2).toUpperCase();

  return (
    <div className="me" style={{ position: "relative", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }} onClick={() => setOpen((v) => !v)}>
        <span className="avatar">{initials}</span>
        <div className="me-meta"><strong>{userId}</strong><span>Signed in</span></div>
      </div>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", background: "#fff", border: "1px solid #e6eaf0", borderRadius: 10, boxShadow: "0 8px 24px rgba(20,30,45,.12)", minWidth: 180, zIndex: 50, overflow: "hidden" }}>
          <button style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", border: "none", background: "none", fontSize: 14, cursor: "pointer" }}
            onClick={() => { setOpen(false); setPwOpen(true); }}>Change password</button>
          <button style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderTop: "1px solid #eef1f5", background: "none", fontSize: 14, color: "#a32626", cursor: "pointer" }}
            onClick={() => { if (window.bccweLogout) window.bccweLogout(); }}>Sign out</button>
        </div>
      )}
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}
