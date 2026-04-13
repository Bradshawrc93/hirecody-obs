import { cn } from "@/lib/utils";

/**
 * Card — the primary container. Subtle border, zero shadow, flat fill.
 * The `card` base class lives in globals.css; the component just adds
 * layout helpers.
 */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function CardHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="card-header flex items-center justify-between">
      <span>{title}</span>
      {right ? <div className="normal-case tracking-normal">{right}</div> : null}
    </div>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("p-5", className)}>{children}</div>;
}
