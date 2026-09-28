"use client";
import { useState } from "react";
import { post, useAction, ErrorNote } from "./api";

export function RequestActions({ id }: { id: number }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const { run, busy, error } = useAction();
  const decide = (decision: "approved" | "rejected") => run(() => post(`/api/requests/${id}/decision`, { decision, note }));

  if (rejecting) {
    return (
      <div className="ml-auto w-[240px] text-left">
        <input className="input" autoFocus placeholder="Reason for rejecting" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="mt-2 flex justify-end gap-2">
          <button className="btn btn-sm" onClick={() => setRejecting(false)}>
            Cancel
          </button>
          <button className="btn btn-sm btn-danger" disabled={busy || note.trim().length < 3} onClick={() => decide("rejected")}>
            Reject
          </button>
        </div>
        <ErrorNote message={error} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end gap-2">
        <button className="btn btn-sm" onClick={() => setRejecting(true)}>
          Reject
        </button>
        <button className="btn btn-sm btn-success" disabled={busy} onClick={() => decide("approved")}>
          Approve
        </button>
      </div>
      <ErrorNote message={error} />
    </div>
  );
}
