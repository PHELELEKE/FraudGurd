"use client";
import { useState } from "react";
import { post, useAction, ErrorNote } from "./api";

export function AlertDecision({
  alertId,
  canDecide,
  escalated,
  previousComment,
}: {
  alertId: number;
  canDecide: boolean;
  escalated: boolean;
  previousComment: string | null;
}) {
  const [comment, setComment] = useState("");
  const { run, busy, error } = useAction();
  const ready = comment.trim().length >= 5;

  if (!canDecide) {
    return (
      <p className="text-[15px] text-mute">
        {escalated ? "This alert has been escalated. " : ""}
        You can read everything about this alert, but only the Finance Manager can approve, reject or escalate it.
      </p>
    );
  }

  const decide = (decision: "approve" | "reject" | "escalate") =>
    run(async () => {
      await post(`/api/alerts/${alertId}/decision`, { decision, comment });
      setComment("");
    });

  return (
    <div>
      {escalated && previousComment && (
        <p className="panel-raised mb-4 px-4 py-3 text-[14px]">
          <span className="text-mute">Escalated with the note: </span>
          {previousComment}
        </p>
      )}
      <label className="label" htmlFor="comment">
        Reason for your decision (required)
      </label>
      <textarea
        id="comment"
        className="input"
        rows={4}
        placeholder="For example: called the supplier on the number we have on file and they confirmed the new account."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="mt-4 grid gap-2">
        <button className="btn btn-success" disabled={!ready || busy} onClick={() => decide("approve")}>
          Approve payment
        </button>
        <button className="btn btn-danger" disabled={!ready || busy} onClick={() => decide("reject")}>
          Reject invoice
        </button>
        {!escalated && (
          <button className="btn" disabled={!ready || busy} onClick={() => decide("escalate")}>
            Escalate
          </button>
        )}
      </div>
      <p className="mt-3 text-[13px] text-mute">
        Approving posts the invoice to the ledger so it can be paid. Rejecting cancels the invoice and posts nothing. Escalating keeps
        the payment held.
      </p>
      <ErrorNote message={error} />
    </div>
  );
}
