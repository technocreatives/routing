import React from "react"
import { useRouter } from "next/router"
import { fromUrl } from "@thetc/routing"

export function useRoute<T>(constructor: abstract new (...args: any[]) => T): T {
  const { asPath, route } = useRouter()
  return fromUrl(constructor, asPath, route.replace(/\[(.*?)\]/g, "{$1}"))
}