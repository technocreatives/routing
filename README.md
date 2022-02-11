# @thetc/routing

**This project is __alpha quality__ at best. Viewer discretion is advised.**

Frustrated with the state of routing?

### Contents

- `@thetc/routing` — core library including all the route magic
- `@thetc/routing-next` — the `useRoute` hook for use with Next.js

### Philosophy of @thetc/routing

There's a few aspects to this:

- A route has a name, which describes what its purpose is.
- A route is a description of what to show—or data to provide—given a set of values with a specific shape.
- A URL is merely a representation of a route, and not a route unto itself. It has no identity, and is just a string.
- A route can be converted to and from any number of representations as required, though usually a URL is enough.

The crux of it is simple: routes should be objects you can move around, store, and reason about.

## An example with Next.js

Let's do it differently. Let's say we've got those path parameters above, but we also need to handle some optional
query parameters. Oof, now pain ensues. And validation? Ah. Pain.

Well, let's see how far we can get with `@thetc/routing-next` to add typing. Let's start with something simple.

The powerhouse of this library is the `useRoute` hook. Feed it a class that is decorated with the appropriate
decorators and you will receive typesafe parameters.

```typescript
// .../src/pages/example/[name].tsx

import { NextPage } from "next"
import { path, query } from "@thetc/routing"
import { useRoute } from "@thetc/routing-next"

const ExamplePage: NextPage = () => {
  const { name, other, isHappy } = useRoute(ExampleRoute)

  return <>
    <div>Hi, {name}! {other}</div>
    {isHappy && <div>You seem happy!</div>}
  </>
}

export default ExamplePage

class ExampleRoute {
  @path()
  name: string = ""

  @query({ type: Boolean, key: "happy" })
  isHappy: boolean = false

  @query()
  other: string = "This is some default text."
}
```

You can try this with the following URLs:

- `/example/Basic`: Will show the `name` as "Basic". No happiness div, and the default text for `other`.
- `/example/smol%20potat?happy`: Now we have a smol potat that claims to be happy, with default text.
- `/example/Potato?happy&other=Send+help.`: Potato has grown up, but is asking for help.


### A more advanced example

You have an app with some nested mess of params. Let's use `pages/[mode]/[type]/[id].tsx` as an example.

The route for this is `/[mode]/[type]/[id]`. Ordinary, to get these, you get the router object and look through params
in a typeless bag of keys. Not my favourite way.

```typescript
// .../src/pages/[mode]/[type]/[id].tsx
import { NextPage } from "next"
import { path, query } from "@thetc/routing"
import { useRoute } from "@thetc/routing-next"

const FleetDetailPage: NextPage = () => {
  const { fleetMode, target, filter } = useRoute(FleetDetailRoute)
  return <div>{mode}, {JSON.stringify(target)}, {JSON.stringify(filter)}</div>
}

export default FleetDetailPage

// Here's the route type!
class FleetDetailRoute {
  constructor(mode: FleetDetailRouteMode, target: FleetDetailRouteTarget) {
    this.fleetMode = mode
    this.target = target
  }

  // Use the @path decorator to specify that a property should be populated from the path
  // Using a single parameter of type string will specify the path param to use if the 
  // property name differs, otherwise it can be left empty (@path() is valid).
  @path("mode")
  fleetMode: FleetDetailRouteMode

  // A more complex, nested object. This requires using a serialisation and deserialisation function.
  @path(serializeTarget, deserializeTarget)
  target: FleetDetailRouteTarget

  // The same as above, but for query parameters! See their implementations below.
  // Note that the @query property here has a default constructor.
  @query(serializeFilter, deserializeFilter)
  filter: FleetDetailRouteFilter = {}
}

// Supporting types

enum FleetDetailRouteMode {
  Map = "map",
  List = "list"
}

type FleetDetailRouteTarget = DockTarget | BoatTarget 

type FleetDetailRouteFilter = {
  region?: string,
  dock?: string,
  boat?: string,
}

type DockTarget = {
  type: "dock"
  id: string
}

type BoatTarget = {
  type: "boat"
  id: string
}

function serializeTarget(input: FleetDetailRouteTarget) {
  return {
    type: input.type,
    id: input.id,
  }
}

function deserializeTarget(input: Record<string, string>) {
  return {
    type: input.type,
    id: input.id
  }
}

function serializeFilter(input: FleetDetailRouteFilter) {
  const o: Record<string, string> = {}
  if (input.region) {
    o["filter-region"] = input.region
  }
  if (input.dock) {
    o["filter-dock"] = input.dock
  }
  if (input.boat) {
    o["filter-boat"] = input.boat
  }
  return o
}

function deserializeFilter(input: URLSearchParams) {
  return {
    region: input.get("filter-region"),
    dock: input.get("filter-dock"),
    boat: input.get("filter-boat")
  }
}
```

This should set you on your way to success.

## License

Licensed under either of

* Apache License, Version 2.0, ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
* MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.
