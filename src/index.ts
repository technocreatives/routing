import "reflect-metadata"
import escapeRegExp from "lodash.escaperegexp"

const routingKey = Symbol("routing")

const enum RoutingType {
  Path,
  PathSerde,
  Query,
  QuerySerde,
}

export type PathSerializeFn = (input: any) => Record<string, string>
export type PathDeserializeFn = (input: Record<string, string>) => unknown
export type QuerySerializeFn = (input: any) => Record<string, string>
export type QueryDeserializeFn = (input: URLSearchParams) => unknown

type PathMetadata = {
  type: RoutingType.Path,
  propertyKey: string
} | {
  type: RoutingType.PathSerde,
  serialize: PathSerializeFn,
  deserialize: PathDeserializeFn
}

type QueryMetadata = {
  type: RoutingType.Query,
  propertyKey: string
} | {
  type: RoutingType.QuerySerde,
  serialize: QuerySerializeFn,
  deserialize: QueryDeserializeFn
}

type Metadata = PathMetadata | QueryMetadata

export function path(
  serialize: PathSerializeFn,
  deserialize: PathDeserializeFn
): {
  (target: Function): void
  (target: Object, propertyKey: string | symbol): void
}
export function path(
  propertyKey: string
): {
  (target: Function): void
  (target: Object, propertyKey: string | symbol): void
}
export function path(): {
  (target: Function): void
  (target: Object, propertyKey: string | symbol): void
}

export function path() {
  if (arguments.length === 1) {
    if (typeof arguments[0] !== "string") {
      throw new TypeError("First argument must be of type string.")
    }

    const [propertyKey] = arguments
    return Reflect.metadata(routingKey, {
      type: RoutingType.Path,
      propertyKey
    })
  }

  if (arguments.length >= 2) {
    if (typeof arguments[0] !== "function") {
      throw new TypeError("First argument must be of type function.")
    }
    if (typeof arguments[1] !== "function") {
      throw new TypeError("Second argument must be of type function.")
    }

    const [serialize, deserialize] = arguments
    return Reflect.metadata(routingKey, {
      type: RoutingType.PathSerde,
      serialize,
      deserialize,
    })
  }

  return Reflect.metadata(routingKey, {
    type: RoutingType.Path,
  })
}


export function query(
  serialize: QuerySerializeFn,
  deserialize: QueryDeserializeFn
): {
  (target: Function): void
  (target: Object, propertyKey: string | symbol): void
}
export function query(
  propertyKey: string
): {
  (target: Function): void
  (target: Object, propertyKey: string | symbol): void
}
export function query(): {
  (target: Function): void
  (target: Object, propertyKey: string | symbol): void
}

export function query() {
  if (arguments.length === 1) {
    if (typeof arguments[0] !== "string") {
      throw new TypeError("First argument must be of type string.")
    }

    const [propertyKey] = arguments
    return Reflect.metadata(routingKey, {
      type: RoutingType.Query,
      propertyKey
    })
  }

  if (arguments.length >= 2) {
    if (typeof arguments[0] !== "function") {
      throw new TypeError("First argument must be of type function.")
    }
    if (typeof arguments[1] !== "function") {
      throw new TypeError("Second argument must be of type function.")
    }

    const [serialize, deserialize] = arguments
    return Reflect.metadata(routingKey, {
      type: RoutingType.QuerySerde,
      serialize,
      deserialize,
    })
  }

  return Reflect.metadata(routingKey, {
    type: RoutingType.Query,
  })
}

export abstract class Route {
  abstract readonly route: string
  
  toRelativeUrl() {
    const pathParams: Record<string, string> = {}
    const queryParams: Record<string, string | string[]> = {}

    for (const propName of Object.getOwnPropertyNames(this)) {
      const meta: Metadata = Reflect.getMetadata(
        routingKey,
        this as any, 
        propName
      )
      if (meta != null) {
        const value = (this as Record<string, any>)[propName]
        if (value == null) {
          continue
        }

        switch (meta.type) {
          case RoutingType.Path: {
            const key = meta.propertyKey ?? propName
            pathParams[key] = value.toString()
            break
          }
          case RoutingType.PathSerde: {
            const { serialize } = meta
            Object.assign(pathParams, serialize(value))
            break
          }
          case RoutingType.Query: {
            const key = meta.propertyKey ?? propName
            queryParams[key] = value.toString()
            break
          }
          case RoutingType.QuerySerde: {
            const { serialize } = meta
            Object.assign(queryParams, serialize(value))
            break
          }
        }
      }
    }
    
    return toRelativePath(this.route, pathParams, queryParams)
  }
}

function resolveFieldsMetadata(route: Route) {
  const pathFields: Record<string, string | PathDeserializeFn> = {}
  const queryFields: Record<string, string | QueryDeserializeFn> = {}

  for (const propName of Object.getOwnPropertyNames(route)) {
    const meta: Metadata | undefined = Reflect.getMetadata(routingKey, route, propName)

    if (meta == null) {
      continue
    }

    switch (meta.type) {
      case RoutingType.Path:
        pathFields[propName] = meta.propertyKey ?? propName
        break
      case RoutingType.PathSerde:
        pathFields[propName] = meta.deserialize
        break
      case RoutingType.Query:
        queryFields[propName] = meta.propertyKey ?? propName
        break
      case RoutingType.QuerySerde:
        queryFields[propName] = meta.deserialize
        break
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

function toRelativePath(
  pattern: string,
  pathParams: Record<string, string>,
  queryParams?: Record<string, string | string[]>
) {
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
