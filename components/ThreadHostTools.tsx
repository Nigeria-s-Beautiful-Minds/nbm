import { ActionForm, Field } from "@/components/ActionForm";
import { blockAction, threadStatusAction, threadSummaryAction } from "@/lib/actions/discussion";
import type { ThreadDetail } from "@/lib/discussions-shared";

/** Lock, reopen and summarise: shown to the thread's own host. Moderators get lock and archive with a reason. */
export function ThreadHostTools({ thread, isModerator }: { thread: ThreadDetail; isModerator: boolean }) {
  const next = thread.status === "OPEN" ? "LOCKED" : "OPEN";
  return (
    <div className="panel">
      <h2>{thread.isHost ? "Host controls" : "Moderator controls"}</h2>
      {thread.status !== "ARCHIVED" && (
        <ActionForm action={threadStatusAction} submitLabel={next === "LOCKED" ? "Lock conversation" : "Reopen conversation"} className="stack" buttonClassName="button small secondary">
          <input type="hidden" name="threadId" value={thread.id} />
          <input type="hidden" name="status" value={next} />
          {!thread.isHost && <Field name="reason" label="Reason (recorded)" required />}
        </ActionForm>
      )}
      {isModerator && thread.status !== "ARCHIVED" && (
        <div className="mt-2">
          <ActionForm action={threadStatusAction} submitLabel="Archive (hide from public)" className="stack" buttonClassName="button small danger" confirm="Archive this conversation? It will no longer be public.">
            <input type="hidden" name="threadId" value={thread.id} />
            <input type="hidden" name="status" value="ARCHIVED" />
            <Field name="reason" label="Reason for archiving (recorded)" required />
          </ActionForm>
        </div>
      )}
      {thread.isHost && (
        <div className="mt-2">
          <ActionForm action={threadSummaryAction} submitLabel="Save summary" className="stack" buttonClassName="button small secondary">
            <input type="hidden" name="threadId" value={thread.id} />
            <Field name="summary" label="Written summary" type="textarea" rows={4} defaultValue={thread.summary ?? ""} hint="A short record of what was discussed, for people who couldn't be there." />
          </ActionForm>
        </div>
      )}
    </div>
  );
}

export function BlockHostForm({ userId, name, blocked, path }: { userId: string; name: string; blocked: boolean; path: string }) {
  return (
    <ActionForm action={blockAction} submitLabel={blocked ? `Unblock ${name}` : `Block ${name}`} className="stack" buttonClassName="text-button small">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="blocked" value={blocked ? "false" : "true"} />
      <input type="hidden" name="path" value={path} />
    </ActionForm>
  );
}
