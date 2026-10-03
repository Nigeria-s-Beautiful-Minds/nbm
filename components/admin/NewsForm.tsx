import { ActionForm, Field } from "@/components/ActionForm";
import { ImageUploadField } from "@/components/ImageUploadField";
import { saveNewsAction } from "@/lib/actions/admin";
import { NEWS_CATEGORIES } from "@/lib/content";

type Article = { id: string; title: string; category: string; excerpt: string; body: string; status: string; coverUploadId: string | null; coverAlt: string | null; linkedExhibition: { slug: string } | null };

export function NewsForm({ article }: { article: Article | null }) {
  return (
    <ActionForm action={saveNewsAction} submitLabel="Save" pendingLabel="Saving…">
      {article && <input type="hidden" name="id" value={article.id} />}
      <Field name="title" label="Title" required defaultValue={article?.title} maxLength={180} />
      <Field name="category" label="Category" type="select" required full={false} options={NEWS_CATEGORIES} defaultValue={article?.category} />
      <Field name="status" label="Status" type="select" required full={false} defaultValue={article?.status ?? "DRAFT"} options={[{ value: "DRAFT", label: "Draft (editors only)" }, { value: "PUBLISHED", label: "Published" }, { value: "ARCHIVED", label: "Archived (not public)" }]} />
      <Field name="excerpt" label="Excerpt" type="textarea" rows={2} required defaultValue={article?.excerpt} maxLength={400} />
      <Field name="body" label="Body" type="textarea" rows={16} required defaultValue={article?.body} hint="Blank line between paragraphs. ## Heading, - bullet, **bold**, [link text](https://example.org)." />
      <ImageUploadField name="coverUploadId" purpose="NEWS_COVER" label="Cover image" initialUploadId={article?.coverUploadId ?? null} />
      <Field name="coverAlt" label="Describe the cover image" defaultValue={article?.coverAlt ?? ""} maxLength={300} />
      <Field name="linkedExhibitionSlug" label="Related exhibition" defaultValue={article?.linkedExhibition?.slug ?? ""} hint="Paste the address of a published project to link to it, rather than copying its content." />
    </ActionForm>
  );
}
