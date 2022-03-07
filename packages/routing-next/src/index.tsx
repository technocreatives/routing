import React from "react"
import NextLink from "next/link"
import { useRouter } from "next/router"
import { fromUrl, toRelativeUrl } from "@thetc/routing"

export function useRoute<T>(constructor: abstract new (...args: any[]) => T): T {
  const { asPath, route } = useRouter()
  return fromUrl(constructor, asPath, route.replace(/\[(.*?)\]/g, "{$1}"))
}

export type LinkProps<T> = {
  route: T,
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  prefetch?: boolean;
  locale?: string | false;
}

export function Link<T>(props: React.PropsWithChildren<LinkProps<T>>) {
  const ordinaryProps = props
  const route = props.route

  return <NextLink {...ordinaryProps} href={toRelativeUrl(route)} />
}
