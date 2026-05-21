'use client'

/**
 * Skeleton primitives for loading states. Replaces `<Loader2 spin />`
 * in list-like surfaces where the rough shape of the final layout is
 * known — feels less like a blocking wait and more like content
 * arriving in pieces.
 *
 * The animation hooks into the `.shimmer` class defined in globals.css
 * (gradient sweep across surface, prefers-reduced-motion respected).
 */

interface SkeletonProps {
  className?: string
  /** Tailwind width: `w-32`, `w-full`, etc. Default `w-full`. */
  width?: string
  /** Tailwind height: `h-4`, `h-10`, etc. Default `h-4`. */
  height?: string
  /** Tailwind radius. Default `rounded-md`. */
  rounded?: string
}

export function Skeleton({
  className = '',
  width = 'w-full',
  height = 'h-4',
  rounded = 'rounded-md',
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`shimmer bg-gray-200 dark:bg-gray-700/60 ${width} ${height} ${rounded} ${className}`}
    />
  )
}

/** Multi-line text skeleton — N bars with the last one shorter. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? 'w-2/3' : 'w-full'}
          height="h-3"
        />
      ))}
    </div>
  )
}

/** Row skeleton for table-like list views (icon + line). */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3" aria-hidden="true">
      <Skeleton width="w-10" height="h-10" rounded="rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton width="w-3/5" height="h-3" />
        <Skeleton width="w-2/5" height="h-2" />
      </div>
    </div>
  )
}
