export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2 font-semibold select-none">
      <span className={`grid place-items-center rounded-lg bg-accent text-accent-ink ${small ? "size-7 text-sm" : "size-9"}`}>O</span>
      <span className={small ? "text-sm" : "text-base"}>OceanX Studio</span>
    </div>
  );
}
