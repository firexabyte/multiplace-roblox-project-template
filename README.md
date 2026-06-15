# multiplace-roblox-project-template

A multi-place Roblox project. Players spawn in the **lobby**, then teleport to a
**map** (each map is its own place with its own PlaceId). Code that both places
need lives in **shared/**.

## Layout

```
multiplace-roblox-project-template/
├── places/
│   ├── lobby/src/      # lobby place — same folder structure as the single-place template
│   │   ├── features/   #   place-specific features (feature = self-contained folder)
│   │   ├── core/       #   place-specific core code (platform, ui/primitives)
│   │   ├── game/       #   place-specific game code (assets, items)
│   │   └── startup/    #   per-place boot: Client.client / Server.server / MountUI
│   └── map/src/        # map place — identical structure to lobby
│       ├── features/
│       ├── core/
│       ├── game/
│       └── startup/
├── shared/src/         # code shared by every place (merged into each place's Source)
│   ├── features/       #   cross-place features (e.g. Teleport/) shared by all places
│   ├── core/           #   platform/SoundController, ui/UITypes, ui/primitives/*
│   └── game/           #   Configs, assets/*, items/*
├── tools/
│   └── genFeatureTree.js   # generates one <place>.project.json per place
├── lobby.project.json      # generated — do not hand-edit
├── map.project.json        # generated — do not hand-edit
├── rokit.toml
├── wally.toml
├── selene.toml
└── package.json
```

Each place keeps the **same folder structure as the single-place template**
(`features/`, `core/`, `game/`, `startup/`). The `shared/` library is **merged
into each place's `ReplicatedStorage.Source`** tree at build time — so a shared
module and a place module sit side by side under `Source.Features` / `Source.Core`
/ `Source.Game`. If a place file and a shared file resolve to the same name, the
**place file wins**.

### Feature-based structure

This project follows a **feature-based** layout: every source root has a
`features/` folder, and each feature is a **self-contained folder** holding all
of its own code. A feature's server-side files (anything with `server` in the filename)
are routed to `ServerScriptService.Features`; everything else goes to
`ReplicatedStorage.Source.Features`. Place-specific features live in each place's
`features/`; features shared by every place live in `shared/src/features/`.

## Getting Started

Install the toolchain and dependencies:

```bash
rokit install
wally install
npm install
```

Generate the per-place project files (re-run whenever you add/remove files):

```bash
npm run build:rojo        # one-shot
npm run watch:rojo        # regenerate on every change under places/ and shared/
```

Build and serve a place — pick the one you're working on:

```bash
# Lobby
rojo build lobby.project.json -o "lobby.rbxlx"
rojo serve lobby.project.json

# Map
rojo build map.project.json -o "map.rbxlx"
rojo serve map.project.json
```

Each `.rbxlx` is published to its own Roblox place (its own PlaceId). Use
`TeleportService` in the lobby's startup code to send players to a map's PlaceId.

## Adding another map

The generator auto-discovers places. To add `map2`:

```bash
cp -r places/map places/map2
npm run build:rojo        # emits map2.project.json automatically
```

No edits to `genFeatureTree.js` are required.

For more help, see [the Rojo documentation](https://rojo.space/docs).
