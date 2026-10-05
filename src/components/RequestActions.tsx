"use client";
import { useState } from "react";
import { post, useAction, ErrorNote } from "./api";

export function RequestActions({ id, duplicates = [], possibleDuplicates = [] }: {
  id: number;
  duplicates?: { ref: string; company: string; requester: string; created_at: Date }[];
  possibleDuplicates?: { ref: string; company: string; requester: string; created_at: Date }[];
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const { run, busy, error } = useAction();
  const decide = (decision: "approved" | "rejected") => run(() => post(`/api/requests/${id}/decision`, { decision, note }));
  const hasDuplicates = duplicates.length > 0;
  const hasPossibleDuplicates = possibleDuplicates.length > 0;
  const needsNote = hasDuplicates || hasPossibleDuplicates;

  const noteInput = (
    <input
      className="input"
      autoFocus={rejecting || needsNote}
      placeholder={needsNote ? "Reason for this decision" : "Reason for rejecting"}
      value={note}
      onChange={(e) => setNote(e.target.value)}
    />
  );

  if (rejecting && !needsNote) {
    return (
      <div className="ml-auto w-[240px] text-left">
        {noteInput}
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

  if (needsNote) {
    return (
      <div className="ml-auto w-[240px] text-left">
        {noteInput}
        <div className="mt-2 flex justify-end gap-2">
          <button className="btn btn-sm btn-danger" disabled={busy || note.trim().length < 3} onClick={() => decide("rejected")}>
            Reject
          </button>
          <button className="btn btn-sm btn-success" disabled={busy || note.trim().length < 3} onClick={() => decide("approved")}>
            Approve
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
