# Sport Taxonomy

## Canonical SportCode

```
soccer
tennis
cs2
basketball
ice_hockey
mma
other
```

## Core Sports (Sprint 1–3)

```
soccer
tennis
cs2
```

## Future Sports

```
basketball
ice_hockey
mma
dota2
lol
baseball
american_football
```

## Scanner MVP Canonical Sports

Scanner must use only:

```
soccer
tennis
cs2
basketball
ice_hockey
mma
other
```

## Required Alias Mapping

```
football        → soccer
soccer          → soccer

tennis          → tennis

counter-strike  → cs2
counter strike  → cs2
cs              → cs2
cs2             → cs2

basketball      → basketball

hockey          → ice_hockey
ice hockey      → ice_hockey
ice_hockey      → ice_hockey

ufc             → mma
mma             → mma

unknown / unsupported → other
```

## Rule

No mixed sport labels are allowed in scanner output, filters, saved records, or AI/scanner API boundaries.

All sport values stored in the database must match the canonical SportCode list.
