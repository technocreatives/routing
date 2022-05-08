import "reflect-metadata"

const routeKey = Symbol("routing/route")
const nameKey = Symbol("routing/name")
const routingKey = Symbol("routing/meta")

const reRegExpChar = /[\\^$.*+?()[\]{}|]/g
const reHasRegExpChar = RegExp(reRegExpChar.source)

// From lodash, MIT licensed.
function escapeRegExp(string: string) {
  return reHasRegExpChar.test(string)
    ? string.replace(reRegExpChar, '\\$&')
    : string
}

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
  dataType?: Function,
} | {
  type: RoutingType.PathSerde,
  serialize: PathSerializeFn,
  deserialize: PathDeserializeFn
}

type QueryMetadata = {
  type: RoutingType.Query,
  propertyKey: string,
  dataType?: Function,
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

type QueryArguments = {
  key?: string,
  type?: Function,
}

export function query(): {
  (target: Function): void
  (target: Object, propertyKey: string | symbol): void
}
export function query(
  propertyKey: string
): {
  (target: Function): void
  (target: Object, propertyKey: string | symbol): void
}
export function query(
  serialize: QuerySerializeFn,
  deserialize: QueryDeserializeFn
): {
  (target: Function): void
  (target: Object, propertyKey: string | symbol): void
}
export function query({
  key,
  type,
}: QueryArguments): {
  (target: Function): void
  (target: Object, propertyKey: string | symbol): void
}
export function query() {
  if (arguments.length === 1) {
    if (typeof arguments[0] === "string") {
      const [propertyKey] = arguments
      return Reflect.metadata(routingKey, {
        type: RoutingType.Query,
        propertyKey
      })
    }

    if (typeof arguments[0] === "object") {
      const { key, type } = arguments[0] as QueryArguments
      return Reflect.metadata(routingKey, {
        type: RoutingType.Query,
        propertyKey: key,
        dataType: type,
      })
    }

    throw new TypeError("First argument must be of type string.")
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

export function toRelativeUrl(obj: any, route?: string) {
  const pathParams: Record<string, string> = {}
  const queryParams: Record<string, string | string[]> = {}

  for (const propName of Object.getOwnPropertyNames(obj)) {
    const meta: Metadata = Reflect.getMetadata(
      routingKey,
      obj, 
      propName
    )
    if (meta != null) {
      const value = obj[propName]
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
          if (meta.dataType === Boolean && value != null && value != false) {
            queryParams[key] = ""
          } else {
            queryParams[key] = value.toString()
          }
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
  
  return toRelativePath(route ?? obj[routeKey], pathParams, queryParams)
}

function resolveFieldsMetadata(route: Record<string, any>) {
  const pathFields: Record<string, string | PathDeserializeFn> = {}
  const queryFields: Record<string, [string, Function | undefined] | QueryDeserializeFn> = {}

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
        queryFields[propName] = [meta.propertyKey ?? propName, meta.dataType]
        break
      case RoutingType.QuerySerde:
        queryFields[propName] = meta.deserialize
        break
    }
  }

  return { pathFields, queryFields }
}

function assertIsRoute(type: Function | object) {
  if ((type as any)[routeKey] == null) {
    throw new TypeError("Type does not contain a route. Use the @route decorator.")
  }
}

export function fromUrl<T>(type: Function, path: string, route?: string): T {
  if (route == null) {
    assertIsRoute(type)
  }

  const tmp: any = new (type as any)
  const { pathFields, queryFields } = resolveFieldsMetadata(tmp)

  const pathRegex = escapeRegExp(route ?? tmp[routeKey]).replace(/\\\{(.*?)\\\}/g, "(?<$1>[^/?]+)")
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
      tmp[key] = decodeURIComponent(regexValue)
    } else if (typeof value === "function") {
      tmp[key] = value(groups)
    }
  }

  for (const [key, value] of Object.entries(queryFields)) {
    if (Array.isArray(value)) {
      const [propName, dataType] = value
      const queryValue = queryParams.get(propName)
      
      if (dataType === Boolean) {
        tmp[key] = queryValue != null
        continue
      } else if (queryValue == null) {
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

const knownRoutes: Record<string, Record<string, Function[]>> = {}

export function route(name: string, path: string, options?: {
  group?: string
}) {
  return (constructor: Function) => {
    const group = options?.group ?? ""

    if (knownRoutes[group] == null) {
      knownRoutes[group] = {}
    }

    if (knownRoutes[group][name] == null) {
      knownRoutes[group][name] = []
    }

    Object.defineProperties(constructor, {
      [routeKey]: {
        get() { return path }
      },
      [nameKey]: {
        get() { return name }
      }
    })

    Object.defineProperties(constructor.prototype, {
      [routeKey]: {
        get() { return (constructor as any)[routeKey] }
      },
      [nameKey]: {
        get() { return (constructor as any)[nameKey] }
      }
    })

    knownRoutes[group][name].push(constructor)
  }
}

export function routePath(route: Function | object) {
  assertIsRoute(route)

  return (route as any)[routeKey]
}

export function routeName(route: Function | object) {
  assertIsRoute(route)

  return (route as any)[nameKey]
}

export function definedRoutes(group: string = "") {
  return knownRoutes[group]
}

export function from(url: string, group: string = ""): Route | null {
  for (const [name, candidates] of Object.entries(definedRoutes(group))) {
    for (const candidate of candidates) {
      try {
        const route = fromUrl(candidate, url)
        return {
          name,
          route
        }
      } catch (e) {}
    }
  }
  return null
}

type Route = {
  name: string,
  route: OpaqueRoute
}

type OpaqueRoute = unknown
