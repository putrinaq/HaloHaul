/** Title and one-line caption at the top of a glass panel. */
export function PanelHeading({ title, caption }: { title: string; caption: string }) {
  return (
    <div>
      <h2 className="text-xl font-medium text-white">{title}</h2>
      <p className="mt-1 text-sm text-white/50">{caption}</p>
    </div>
  );
}
