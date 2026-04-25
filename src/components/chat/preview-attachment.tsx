import Image from "next/image";
import type { Attachment } from "@/lib/types";
import { Spinner } from "../ui/spinner";
import { CrossSmallIcon } from "./icons";

function formatBytes(bytes?: number) {
  if (!bytes && bytes !== 0) return "";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n = n / 1024;
    i += 1;
  }
  return `${Math.round(n * 10) / 10} ${units[i]}`;
}

function truncateFilename(name?: string, max = 28) {
  if (!name) return "";
  if (name.length <= max) return name;
  const match = name.match(/(\.[^.]*)$/);
  const ext = match ? match[1] : "";
  const base = ext ? name.slice(0, -ext.length) : name;
  const avail = max - ext.length - 3; // reserve for ellipsis
  if (avail <= 1) return base.slice(0, Math.max(0, max - 3)) + "..." + ext;
  const front = Math.ceil(avail / 2);
  const back = Math.floor(avail / 2);
  return base.slice(0, front) + "..." + base.slice(Math.max(0, base.length - back)) + ext;
}

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType, size } = attachment;

  // Compact chip used for both images and documents to match screenshots.
  const isImage = contentType?.startsWith("image") && !!url;

  const displayName = truncateFilename(name, 28);

  return (
    <div
      className="group inline-flex items-center gap-3 rounded-lg border border-border/30 bg-card px-3 py-2 shadow-(--shadow-card)"
      data-testid="input-attachment-preview"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {isImage ? (
          <Image
            alt={name ?? "attachment"}
            className="h-full w-full object-cover"
            height={36}
            src={url}
            width={36}
          />
        ) : (
          <div className="text-xs font-medium text-muted-foreground">{contentType?.includes("pdf") ? "PDF" : "FILE"}</div>
        )}
      </div>

      <div className="min-w-0 flex flex-col">
        <div className="truncate text-sm text-foreground" title={name}>{displayName}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{formatBytes(size)}</div>
      </div>

      <div className="flex items-center justify-center">
        {isUploading ? (
          <div className="flex items-center gap-2">
            <Spinner className="size-4" />
          </div>
        ) : (
          onRemove && (
            <button
              className="ml-2 flex h-6 w-6 items-center justify-center rounded-full bg-transparent text-muted-foreground transition-colors hover:bg-muted"
              onClick={onRemove}
              type="button"
              aria-label={`Remove ${name}`}
            >
              <CrossSmallIcon size={12} />
            </button>
          )
        )}
      </div>
    </div>
  );
};
