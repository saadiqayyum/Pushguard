/**
 * The heading block every dashboard page starts with. Title and description
 * only: actions belong in the toolbar above the table they act on, so that
 * switching tabs does not move the furniture.
 */
export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
