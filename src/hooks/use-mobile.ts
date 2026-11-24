import * as React from "react"
import { subscribeToMediaQuery } from "@/lib/media-query"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`
    const onChange = () => {
      setIsMobile(window.matchMedia(query).matches)
    }
    const unsubscribe = subscribeToMediaQuery(query, onChange)
    onChange()
    return unsubscribe
  }, [])

  return !!isMobile
}
