/**
 * Incident detail — the citizen-facing case view.
 *
 * Sections are ordered the way a resident needs them: what is happening, where,
 * how far along the response is, and what they can still do. Coordinates shown
 * here are the coarse ones the API publishes, never a reporter's exact position.
 */

import { useCallback, useState } from "react";
import {
  CheckCircle2,
  Clock,
  MapPin,
  MessageSquare,
  Radio,
  ThumbsUp,
  Users
} from "lucide-react";
import { publicApi, incidentsApi } from "../../lib/api.js";
import { useAsync } from "../../lib/hooks.js";
import { formatApproximate, formatDateTime, formatRelative, pluralise } from "../../lib/format.js";
import { buildTimeline, statusLabel } from "../../domain/incidents.js";
import { useApp } from "../../app/AppContext.jsx";
import { MapCanvas, MapAttribution } from "../../components/map/MapView.jsx";
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  KeyValueList,
  ListSkeleton,
  PageHeader,
  SeverityBadge,
  StatusBadge,
  Textarea,
  Timeline
} from "../../components/ui/index.js";

/** "Me too" / "power is back" — one confirmation per person per kind. */
function ConfirmationForm({ incidentId, onRecorded, canConfirmAffected, canConfirmRestored }) {
  const { user } = useApp();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);

  async function confirm(type) {
    setBusy(type);
    setNotice(null);
    try {
      const result = await publicApi.confirm(incidentId, {
        type,
        deviceId: user ? undefined : getDeviceId(),
        comment: comment || undefined
      });
      setComment("");
      setNotice({ tone: "success", text: type === "restored" ? "Thank you — restoration recorded." : "Thank you — your report has been added." });
      onRecorded?.(result.confirmations);
    } catch (error) {
      setNotice({ tone: "warning", text: error.message });
    } finally {
      setBusy("");
    }
  }

  if (!canConfirmAffected && !canConfirmRestored) return null;

  return (
    <div className="stack stack--sm">
      <Textarea
        label="Add a short comment (optional)"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={500}
        rows={2}
        placeholder="e.g. Still dark on our street, or power came back at noon."
      />
      <div className="inline-row">
        {canConfirmAffected ? (
          <Button variant="secondary" icon={ThumbsUp} busy={busy === "also_affected"} onClick={() => confirm("also_affected")}>
            We are affected too
          </Button>
        ) : null}
        {canConfirmRestored ? (
          <Button variant="primary" icon={CheckCircle2} busy={busy === "restored"} onClick={() => confirm("restored")}>
            Power is back
          </Button>
        ) : null}
      </div>
      {notice ? (
        <Alert tone={notice.tone} icon={notice.tone === "success" ? CheckCircle2 : undefined}>
          {notice.text}
        </Alert>
      ) : null}
    </div>
  );
}

/** Conversation on a case. Reading is public; posting requires an account. */
function CaseMessages({ incidentId, messages, onPosted }) {
  const { user } = useApp();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(event) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await incidentsApi.sendMessage(incidentId, body.trim());
      setBody("");
      onPosted?.();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack stack--sm">
      {messages.length === 0 ? (
        <p className="text-secondary">No messages on this case yet.</p>
      ) : (
        <ul className="stack stack--sm">
          {messages.map((message) => (
            <li key={message.id} className="card card--pad">
              <p className="text-caption">
                <strong>{message.author_name}</strong> · {message.author_role} · {formatRelative(message.created_at)}
              </p>
              <p className="body-text">{message.body}</p>
            </li>
          ))}
        </ul>
      )}

      {user ? (
        <form className="stack stack--sm" onSubmit={send}>
          <Textarea
            label="Message the responders"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Share anything that helps the crew."
            error={error || undefined}
          />
          <Button type="submit" variant="primary" icon={MessageSquare} busy={busy} disabled={!body.trim()}>
            Send message
          </Button>
        </form>
      ) : (
        <Alert tone="info" title="Sign in to take part">
          Create a free citizen account to send messages about this case.
        </Alert>
      )}
    </div>
  );
}
