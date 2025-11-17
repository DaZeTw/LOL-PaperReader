import * as React from "react"
import { cn } from "@/lib/utils"

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null
  alt?: string
  fallback?: string
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, ...props }, ref) => {
    const [imgError, setImgError] = React.useState(false)
    
    const displayFallback = !src || imgError
    const initials = fallback
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted",
          className
        )}
        {...props}
      >
        {displayFallback ? (
          <span className="text-sm font-medium text-muted-foreground">
            {initials}
          </span>
        ) : (
          <img
            src={src}
            alt={alt}
            onError={() => setImgError(true)}
            className="h-full w-full object-cover"
          />
        )}
      </div>
    )
  }
)
Avatar.displayName = "Avatar"

export { Avatar }

