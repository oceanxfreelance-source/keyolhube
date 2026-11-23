"use client";
import type { Template } from "@/lib/templates/builtin";
import { useTemplateThumb } from "./useTemplateThumbs";

/** A template preview card; the thumbnail renders when the card scrolls into view. */
export function TemplateCard({ t, onUse, disabled, compact }: { t: Template; onUse: () => void; disabled?: boolean; compact?: boolean }) {
  const { ref, url } = useTemplateThumb(t, compact ? 240 : 320);
  return (
    <button disabled={disabled} data-template={t.id} onClick={onUse} className="group text-left min-w-0" aria-label={`Use template ${t.title}${t.format ? ` (${t.format})` : ""}`}>
      <div ref={ref} className={`relative ${compact ? "aspect-square rounded-lg" : "aspect-[4/5] rounded-xl"} bg-surface-2 border border-line overflow-hidden group-hover:border-accent transition-colors`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" className={`absolute ${compact ? "inset-1.5 h-[calc(100%-0.75rem)] w-[calc(100%-0.75rem)]" : "inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)]"} object-contain drop-shadow-lg group-hover:scale-[1.03] transition-transform`} />
          : <div className="absolute inset-3 rounded-md bg-surface animate-pulse" />}
      </div>
      <div className={`mt-1.5 ${compact ? "text-xs" : "text-[13px]"} font-medium leading-tight truncate`}>{t.title}</div>
      <div className={`${compact ? "text-[11px]" : "text-[11.5px]"} text-muted truncate`}>{t.format ? `${t.format} · ${t.category}` : t.category}</div>
    </button>
  );
}
