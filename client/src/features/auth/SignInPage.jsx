/**
 * Sign-in and registration.
 *
 * The role is part of the URL (/client, /agency, /admin), so the screen always
 * states which workspace it is signing into and lets the user switch to another
 * one instead of guessing. Public sign-up only ever creates citizen accounts —
 * that rule lives on the server, and the UI reflects it.
 */

import { useState } from "react";
import { BadgeCheck, LogIn, ShieldCheck, UserPlus, Wrench } from "lucide-react";
import { authApi } from "../../lib/api.js";
import { ROLES, ROLE_LABEL } from "../../lib/session.js";
import { Alert, Button, Card, TextInput } from "../../components/ui/index.js";

const ROLE_HOME = {
  [ROLES.CITIZEN]: "/client",
  [ROLES.AGENT]: "/agency",
  [ROLES.OPERATOR]: "/admin"
};

const ROLE_INTRO = {
  [ROLES.CITIZEN]: "Report outages, follow your cases and see what is happening near you.",
  [ROLES.AGENT]: "Open your assigned work orders and report progress from the field.",
  [ROLES.OPERATOR]: "Validate clusters, dispatch crews and monitor the network."
};

const ROLE_ICON = {
  [ROLES.CITIZEN]: BadgeCheck,
  [ROLES.AGENT]: Wrench,
  [ROLES.OPERATOR]: ShieldCheck
};

export function SignInPage({ role = ROLES.OPERATOR, notice = "", onSignedIn }) {
  const [mode, setMode] = useState("signin");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const canRegister = role === ROLES.CITIZEN;
  const RoleIcon = ROLE_ICON[role] || BadgeCheck;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "register"
          ? await authApi.register({ username, password, fullName, phone: phone || undefined })
          : await authApi.login({ username, password, role });
      onSignedIn(result);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  function switchRole(nextRole) {
    if (nextRole === role) return;
    window.location.assign(ROLE_HOME[nextRole]);
  }

  return (
    <main className="auth">
      <Card className="auth__card">
        <div className="auth__brand">
          <span className="auth__brand-mark" aria-hidden="true">
            <BadgeCheck size={22} />
          </span>
          <span className="auth__brand-text">
            <strong>PowerWatch Cameroon</strong>
            <span>SOCADEL outage intelligence</span>
          </span>
        </div>

        <div className="auth__panel-switch">
          <div className="tabs" role="tablist" aria-label="Workspace">
            {[ROLES.CITIZEN, ROLES.AGENT, ROLES.OPERATOR].map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                className="tabs__tab"
                aria-selected={value === role}
                onClick={() => switchRole(value)}
              >
                {ROLE_LABEL[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="auth__heading">
          <p className="eyebrow">
            {ROLE_LABEL[role]} workspace
          </p>
          <h1 className="page-title">
            {mode === "register" ? "Create your citizen account" : `Sign in as ${ROLE_LABEL[role].toLowerCase()}`}
          </h1>
          <p className="text-secondary">{ROLE_INTRO[role]}</p>
        </div>

        {notice ? (
          <Alert tone="info" title="Session ended">
            {notice}
          </Alert>
        ) : null}

        <form className="auth__form" onSubmit={submit} noValidate>
          {mode === "register" ? (
            <>
              <TextInput
                label="Full name"
                name="name"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                maxLength={120}
                placeholder="e.g. Aida Ngombe"
              />
              <TextInput
                label="Phone number"
                hint="Optional. Helps the crew reach you about a visit."
                name="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                maxLength={40}
                placeholder="+237 6 00 00 00 00"
              />
            </>
          ) : null}
          <TextInput
            label="Username"
            hint={
              mode === "register"
                ? "3–40 characters: lowercase letters, numbers, dot, dash or underscore."
                : undefined
            }
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            minLength={3}
            maxLength={40}
            placeholder="e.g. aida.ngombe"
          />

          <TextInput
            label="Password"
            hint={mode === "register" ? "At least 8 characters." : undefined}
            name="password"
            type="password"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={mode === "register" ? 8 : 1}
            maxLength={128}
          />

          {error ? (
            <Alert tone="danger" title="We could not sign you in">
              {error}
            </Alert>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            block
            size="lg"
            busy={busy}
            icon={mode === "register" ? UserPlus : LogIn}
          >
            {mode === "register" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <div className="auth__footer">
          {canRegister ? (
            <p>
              {mode === "register" ? "Already have an account?" : "New to PowerWatch?"}{" "}
              <button
                type="button"
                className="auth__switch"
                onClick={() => {
                  setMode(mode === "register" ? "signin" : "register");
                  setError("");
                }}
              >
                {mode === "register" ? "Sign in instead" : "Create a citizen account"}
              </button>
            </p>
          ) : (
            <p>
              Staff accounts are created by a SOCADEL administrator. If you cannot sign in, contact the operations desk.
            </p>
          )}
          <p>
            Not your workspace?{" "}
            <button type="button" className="auth__switch" onClick={() => window.location.assign("/client")}>
              Citizen
            </button>{" "}
            ·{" "}
            <button type="button" className="auth__switch" onClick={() => window.location.assign("/agency")}>
              Field agent
            </button>{" "}
            ·{" "}
            <button type="button" className="auth__switch" onClick={() => window.location.assign("/")}>
              Public map
            </button>
          </p>
        </div>
      </Card>
    </main>
  );
}
