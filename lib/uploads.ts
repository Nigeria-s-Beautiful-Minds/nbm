// Upload rules and server-side verification. The browser's claims (type, size, duration) are
// only used to fail fast; what counts is what we read back from storage after the upload.
import type { Upload, UploadPurpose } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteObject, getObjectSize, readObjectRange } from "@/lib/storage";
import { DOCUMENT_MIME_TYPES, IMAGE_MIME_TYPES, VIDEO_MIME_TYPES, type PilotLimits } from "@/lib/constants";

const MB = 1024 * 1024;

export function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png": return "png";
    case "image/jpeg": return "jpg";
    case "image/webp": return "webp";
    case "video/mp4": return "mp4";
    case "application/pdf": return "pdf";
    default: return "bin";
  }
}

export type UploadRule = { maxBytes: number; label: string };

/** What a given purpose accepts, or null if that type isn't allowed for it. */
export function ruleFor(purpose: UploadPurpose, mime: string, limits: PilotLimits): UploadRule | null {
  const isImage = (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
  const isVideo = (VIDEO_MIME_TYPES as readonly string[]).includes(mime);
  const isDocument = (DOCUMENT_MIME_TYPES as readonly string[]).includes(mime);
  if (purpose === "EXHIBITION_MEDIA") {
    if (isImage) return { maxBytes: limits.imageMaxMb * MB, label: `${limits.imageMaxMb} MB` };
    if (isVideo) return { maxBytes: limits.videoMaxMb * MB, label: `${limits.videoMaxMb} MB` };
    return null;
  }
  if (purpose === "APPLICATION_DOCUMENT") return isDocument ? { maxBytes: limits.documentMaxMb * MB, label: `${limits.documentMaxMb} MB` } : null;
  return isImage ? { maxBytes: limits.imageMaxMb * MB, label: `${limits.imageMaxMb} MB` } : null;
}

/** Sniffs the real file signature so a mislabelled or malicious upload can't pass as media. */
export function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") return "video/mp4";
  if (bytes.length >= 5 && ascii(bytes, 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function u32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function u64(bytes: Uint8Array, offset: number): number {
  return u32(bytes, offset) * 2 ** 32 + u32(bytes, offset + 4);
}

/**
 * The real duration of a stored MP4, read from its movie header (moov > mvhd). Walks the
 * top-level boxes with small range reads, so it works whether moov sits before or after the media data.
 */
export async function mp4DurationSeconds(key: string, size: number): Promise<number | null> {
  let offset = 0;
  for (let i = 0; i < 64 && offset < size; i++) {
    const head = await readObjectRange(key, offset, 16);
    if (!head || head.length < 8) return null;
    let boxSize = u32(head, 0);
    let headerLength = 8;
    if (boxSize === 1) {
      if (head.length < 16) return null;
      boxSize = u64(head, 8);
      headerLength = 16;
    } else if (boxSize === 0) {
      boxSize = size - offset;
    }
    if (boxSize < headerLength) return null;

    if (ascii(head, 4, 8) === "moov") {
      let child = offset + headerLength;
      const end = offset + boxSize;
      for (let j = 0; j < 64 && child < end; j++) {
        const box = await readObjectRange(key, child, 40);
        if (!box || box.length < 8) return null;
        const childSize = u32(box, 0);
        if (ascii(box, 4, 8) === "mvhd") {
          const version = box[8];
          const timescale = version === 1 ? u32(box, 28) : u32(box, 20);
          const duration = version === 1 ? u64(box, 32) : u32(box, 24);
          return timescale > 0 ? duration / timescale : null;
        }
        if (childSize < 8) return null;
        child += childSize;
      }
      return null;
    }
    offset += boxSize;
  }
  return null;
}

/**
 * Checks what storage actually received: real size, real file signature and (for video) real
 * duration. A file that fails is deleted along with its Upload row.
 */
export async function verifyStoredUpload(upload: Upload, limits: PilotLimits): Promise<{ ok: true; upload: Upload } | { ok: false; error: string }> {
  const reject = async (error: string) => {
    await deleteObject(upload.storageKey);
    await prisma.upload.deleteMany({ where: { id: upload.id, attached: false } });
    return { ok: false as const, error };
  };

  const rule = ruleFor(upload.purpose, upload.mime, limits);
  if (!rule) return reject("That file type isn't accepted here.");

  const size = await getObjectSize(upload.storageKey);
  if (size === null) return { ok: false, error: "The upload didn't arrive. Please try again." };
  if (size <= 0 || size > rule.maxBytes) return reject(`The file is too large. The limit is ${rule.label}.`);

  const prefix = await readObjectRange(upload.storageKey, 0, 16);
  if (!prefix || sniffMime(prefix) !== upload.mime) return reject("That file doesn't match its type. Please upload a valid PNG, JPEG, WEBP, MP4 or PDF.");

  let durationSec: number | null = null;
  if (upload.mime === "video/mp4") {
    const duration = await mp4DurationSeconds(upload.storageKey, size);
    if (duration === null) return reject("We couldn't read that video. Please upload a standard MP4 file.");
    if (duration > limits.videoMaxSeconds + 1) {
      return reject(`That video is ${Math.round(duration)} seconds long. The limit is ${Math.round(limits.videoMaxSeconds / 60)} minutes.`);
    }
    durationSec = Math.round(duration);
  }

  const verified = await prisma.upload.update({ where: { id: upload.id }, data: { size, durationSec, verifiedAt: new Date() } });
  return { ok: true, upload: verified };
}

/** Deletes uploads that were started but never attached to anything. Run by the jobs endpoint. */
export async function cleanupAbandonedUploads(olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
  const stale = await prisma.upload.findMany({
    where: { attached: false, createdAt: { lt: new Date(Date.now() - olderThanMs) } },
    take: 200
  });
  for (const upload of stale) {
    await deleteObject(upload.storageKey);
    await prisma.upload.deleteMany({ where: { id: upload.id, attached: false } });
  }
  return stale.length;
}

export const mediaUrl = (uploadId: string) => `/api/media/${uploadId}`;
