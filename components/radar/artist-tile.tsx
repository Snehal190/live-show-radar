import { initials } from "@/lib/logic/text";
import { cn } from "@/lib/utils";

/** Monochrome initials tile (no photos or logos). Must-see artists get the blue ring. */
export function ArtistTile({ name, size = "md", mustSee = false, className }: { name: string; size?: "sm" | "md" | "lg"; mustSee?: boolean; className?: string }) {
  const dims = size === "sm" ? "size-9 text-xs" : size === "lg" ? "size-16 text-xl" : "size-11 text-sm";
  return (
    <div
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-md bg-[#1f1f1f] font-mono font-medium text-[#ededed]", dims, className)}
      style={{ boxShadow: `0 0 0 1px ${mustSee ? "rgb(82 168 255 / 0.6)" : "rgb(255 255 255 / 0.145)"}` }}
    >
      {initials(name)}
    </div>
  );
}
