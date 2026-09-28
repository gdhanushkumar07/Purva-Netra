import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { post, HttpError, type Me } from "@/api/client";
import { Button } from "@/components/ui/button";

/** Simple sign-in. No self-signup: accounts come from configs/users.yaml (see README → Operations console). */
export default function Login() {
  const [u, setU] = useState("operator");
  const [p, setP] = useState("change-me-operator");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const qc = useQueryClient();

  const fillAccount = (username: string, pass: string) => {
    setU(username);
    setP(pass);
    setErr(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const me = await post<Me>("/auth/login", { username: u, password: p });
      const userData: Me = {
        username: me.username,
        role: me.role,
        anonymous: false,
        token: me.token,
      };
      if (me.token) {
        localStorage.setItem("pn_token", me.token);
      }
      localStorage.setItem("pn_user", JSON.stringify(userData));
      qc.setQueryData(["me"], userData);
      await qc.refetchQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["ops"] });
      nav(sp.get("next") ?? (me.role === "viewer" ? "/brief" : "/ops"));
    } catch (x) {
      const s = (x as HttpError).status;
      setErr(s === 429 ? "Too many failed attempts. Wait a few minutes and try again." : s === 401 ? "Invalid username or password." : `Sign-in failed (${(x as Error).message}).`);
    } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <form onSubmit={submit} className="panel" aria-labelledby="login-h">
        <div className="panel-sec"><h1 id="login-h" className="text-lg font-semibold">Sign in</h1>
          <p className="text-xs text-muted-foreground">Operators and admins only. Viewing forecasts needs no account.</p></div>
        <div className="panel-sec space-y-3">
          {/* Quick-fill recommended demo accounts */}
          <div className="rounded border border-border/70 bg-muted/30 p-2.5 space-y-1.5">
            <span className="text-[11px] font-mono font-semibold text-muted-foreground block uppercase tracking-wider">
              Quick Sign-in (Demo Accounts)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fillAccount("operator", "change-me-operator")}
                className={`flex-1 rounded border px-2 py-1 text-xs font-mono text-left transition-all ${
                  u === "operator" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border bg-card hover:bg-muted text-foreground"
                }`}
              >
                <div>operator</div>
                <div className="text-[10px] text-muted-foreground">Ops console</div>
              </button>
              <button
                type="button"
                onClick={() => fillAccount("admin", "change-me-admin")}
                className={`flex-1 rounded border px-2 py-1 text-xs font-mono text-left transition-all ${
                  u === "admin" ? "border-primary bg-primary/10 text-primary font-bold" : "border-border bg-card hover:bg-muted text-foreground"
                }`}
              >
                <div>admin</div>
                <div className="text-[10px] text-muted-foreground">Full controls</div>
              </button>
            </div>
          </div>

          <label className="block text-sm">Username
            <input className="mt-1 h-9 w-full rounded-md border bg-background px-2" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} required data-testid="login-user" />
          </label>
          <label className="block text-sm">Password
            <input className="mt-1 h-9 w-full rounded-md border bg-background px-2" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required data-testid="login-pass" />
          </label>
          {err && <p role="alert" className="text-sm text-destructive" data-testid="login-error">◆ {err}</p>}
          <Button type="submit" className="w-full" disabled={busy} data-testid="login-submit">{busy ? "Signing in…" : "Sign in"}</Button>
        </div>
      </form>
    </div>
  );
}
