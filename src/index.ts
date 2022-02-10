import "reflect-metadata"
import escapeRegExp from "lodash.escaperegexp"

const routingKey = Symbol("routing")

enum RoutingType {
  Path = "path",
  Query = "query"
}

export type PathMetadataRepl = string | ((input: Record<string, string>) => unknown)
export type QueryMetadataRepl = string | ((input: URLSearchParams) => unknown)

type PathMetadata = {
  type: RoutingType.Path,
  repl?: PathMetadataRepl
}

type QueryMetadata = {
  type: RoutingType.Query,
  repl?: QueryMetadataRepl
}

type Metadata = PathMetadata | QueryMetadata

export function path(value?: PathMetadataRepl) {
  return Reflect.metadata(routingKey, {
    type: RoutingType.Path,
    repl: value
  })
}

export function query(value?: QueryMetadataRepl) {
  return Reflect.metadata(routingKey, {
    type: RoutingType.Query,
    repl: value
  })
}

export abstract class Route {
  abstract readonly route: string
  
  toRelativeUrl() {
    const pathParams: Record<string, string> = {}
    const queryParams: Record<string, string | string[]> = {}

    for (const propName of Object.getOwnPropertyNames(this)) {
      const meta = Reflect.getMetadata(routingKey, this as unknown as Object, propName)
      if (meta != null) {
        const key = meta.repl ?? propName
        const value = (this as Record<string, any>)[propName]
        if (value == null) {
          continue
        }

        if (meta.type === RoutingType.Path) {
          if (typeof value === "string") {
            pathParams[key] = value
          }

          if (typeof value === "object") {
            for (const [k, v] of Object.entries(value)) {
              if (typeof v === "string") {
                pathParams[k] = v
              } else if (v != null && typeof (v as any).toString === "function") {
                pathParams[k] = (v as any).toString()
              }
            }
          }

        } else if (meta.type === RoutingType.Query) {
          if (typeof value === "string" || Array.isArray(value)) {
            queryParams[key] = value
          } else if (typeof value === "object") {
            for (const [k, v] of Object.entries(value)) {
              if (typeof v === "string" || Array.isArray(v)) {
                queryParams[k] = v
              } else if (v != null && typeof (v as any).toString === "function") {
                queryParams[k] = (v as any).toString()
              }
            }
          }
        }
      }
    }
    
    return toRelativePath(this.route, pathParams, queryParams)
  }
}

function resolveFieldsMetadata(route: Route) {
  const pathFields: Record<string, PathMetadataRepl> = {}
  const queryFields: Record<string, QueryMetadataRepl> = {}

  for (const propName of Object.getOwnPropertyNames(route)) {
    const meta: Metadata | undefined = Reflect.getMetadata(routingKey, route, propName)

    if (meta == null) {
      continue
    }

    if (meta.type === RoutingType.Path) {
      pathFields[propName] = meta.repl ?? propName
    } else if (meta.type === RoutingType.Query) {
      queryFields[propName] = meta.repl ?? propName
    }
  }

  return { pathFields, queryFields }
}

export function fromUrl<T extends Route>(type: Function, path: string): T {
  const tmp: any = new (type as any)
  const { pathFields, queryFields } = resolveFieldsMetadata(tmp)

  const pathRegex = escapeRegExp(tmp.route).replace(/\\\{(.*?)\\\}/g, "(?<$1>[^/?]+)")
  const re = new RegExp(`${pathRegex}(?:\\?([^#]*))?`)
  const result = re.exec(path)

  if (result == null) {
    throw new Error("Could not parse URL to route")
  }

  const queryParamString = result.pop()
  let queryParams: URLSearchParams

  if (queryParamString != null) {
    queryParams = new URLSearchParams(queryParamString)
  } else {
    queryParams = new URLSearchParams()
  }

  const groups = result.groups ?? {}

  for (const [key, value] of Object.entries(pathFields)) {
    if (typeof value === "string") {
      const regexValue = groups[value]
      if (regexValue == null) {
        if (tmp[key] != null) {
          continue
        }
        throw new Error(`URL is missing path field for '${value}'.`)
      }
      tmp[key] = regexValue
    } else if (typeof value === "function") {
      tmp[key] = value(groups)
    }
  }

  for (const [key, value] of Object.entries(queryFields)) {
    if (typeof value === "string") {
      // TODO: handle mutiple values
      const queryValue = queryParams.get(value)
      if (queryValue == null) {
        if (tmp[key] !== undefined) {
          continue
        }
        throw new Error(`URL is missing query field for '${value}'.`)
      }
      tmp[key] = queryValue
    } else if (typeof value === "function") {
      tmp[key] = value(queryParams)
    }
  }
  
  return tmp
}

function toRelativePath(pattern: string, pathParams: Record<string, string>, queryParams?: Record<string, string | string[]>) {
  let url = pattern

  for (const [key, value] of Object.entries(pathParams)) {
    url = url.replace(`{${key}}`, encodeURIComponent(value))
  }

  if (url.includes("{")) {
    throw new Error("Not all patterns fulfilled")
  }

  if (queryParams != null) {
    const urlParams = new URLSearchParams()
    
    for (const [key, value] of Object.entries(queryParams)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          urlParams.append(key, v)
        }
      } else {
        urlParams.set(key, value)
      }
    }

    const searchSegment = urlParams.toString()

    if (searchSegment !== "") {
      return `${url}?${searchSegment}`
    }
  }

  return url
}
