import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { markNotificationsReadAction } from "@/lib/actions/account";
import { formatDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { requireViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const viewer = await requireViewer("/account/notifications");
  const items = await prisma.notification.findMany({ where: { userId: viewer.id }, orderBy: { createdAt: "desc" }, take: 60 });
  const unread = items.some((n) => !n.readAt);
  return (
    <div>
      <div className="row spread">
        <h1 className="mb-0">Notifications</h1>
        {unread && <ActionForm action={markNotificationsReadAction} submitLabel="Mark all as read" className="inline-form" buttonClassName="button small ghost" />}
      </div>
      {items.length === 0 ? <div className="empty-state mt-2"><h3>Nothing yet</h3><p>Replies, match decisions and moderation notices will appear here.</p></div> : (
        <div className="record-list mt-2">
          {items.map((n) => {
            const content = (<><strong>{n.title}</strong>{n.body && <p>{n.body}</p>}<p className="muted small">{formatDate(n.createdAt)}</p></>);
            return n.href
              ? <Link key={n.id} href={n.href} className={`notification${n.readAt ? "" : " unread"}`}>{content}</Link>
              : <div key={n.id} className={`notification${n.readAt ? "" : " unread"}`}>{content}</div>;
          })}
        </div>
      )}
    </div>
  );
}
