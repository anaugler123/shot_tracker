import { useState } from "react";
export function TeamSettings({
  name,
  readOnly,
  canCreate,
  onRename,
  onCreate,
}: {
  name: string;
  readOnly: boolean;
  canCreate: boolean;
  onRename: (name: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(
    e: React.FormEvent<HTMLFormElement>,
    action: (name: string) => Promise<void>,
  ) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("name") || "");
    setBusy(true);
    setError("");
    try {
      await action(value);
      setNotice("Team saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form onSubmit={(e) => void submit(e, onRename)}>
        <label>
          Team name
          <input
            name="name"
            defaultValue={name}
            required
            maxLength={100}
            disabled={readOnly}
          />
        </label>
        {!readOnly && (
          <button className="button primary" disabled={busy}>
            Save team name
          </button>
        )}
      </form>
      {canCreate && (
        <form
          className="create-team-form"
          onSubmit={(e) => void submit(e, onCreate)}
        >
          <h3>New team</h3>
          <label>
            Name
            <input name="name" required maxLength={100} />
          </label>
          <button className="button primary" disabled={busy}>
            Create team
          </button>
        </form>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="inline-success" role="status">
          {notice}
        </p>
      )}
    </>
  );
}
