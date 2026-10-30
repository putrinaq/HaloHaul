import { formatMyr, type Sen } from "@/domain/money";
import { cn } from "@/lib/utils";

/**
 * A ringgit price. During a promotion the regular price comes first, crossed
 * out; screen readers hear "was RM 6.00, now RM 2.00" rather than two prices.
 */
export function Price({
	sen,
	wasSen = null,
	className,
}: {
	sen: Sen;
	wasSen?: Sen | null;
	className?: string;
}) {
	if (wasSen === null)
		return (
			<span className={cn("whitespace-nowrap", className)}>
				{formatMyr(sen)}
			</span>
		);
	return (
		<span
			className={cn(
				"inline-flex items-baseline gap-1.5 whitespace-nowrap",
				className,
			)}>
			<span className="sr-only">was</span>
			<s className="font-normal opacity-50">{formatMyr(wasSen)}</s>
			<span className="sr-only">, now</span>
			<span>{formatMyr(sen)}</span>
		</span>
	);
}
