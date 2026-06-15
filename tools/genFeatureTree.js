const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Multi-place feature-tree generator
//
// Walks every place under places/<place>/src AND the shared library under
// shared/src, MERGING both into a single Source tree, then writes one Rojo
// project file per place: <place>.project.json
//
// "Merged into Source" means shared modules land in the SAME
// ReplicatedStorage.Source / ServerScriptService tree as the place's own
// modules. Place files win on any name collision (they are applied last).
//
// startup/ is per-place only (each place boots itself). Shared has no startup.
// ---------------------------------------------------------------------------

const ROOT = path.join(__dirname, "..");
const PLACES_PATH = path.join(ROOT, "places");
const SHARED_SRC = path.join(ROOT, "shared", "src");
const WATCH_MODE = process.argv.includes("--watch");

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function toPascalCase(str) {
  if (str.toLowerCase() === "ui") return "UI";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function isServerFile(filename) {
  return filename.toLowerCase().includes("server");
}

function isClientFile(filename) {
  return filename.toLowerCase().includes("client");
}

// Map a .luau file (under some srcRoot) to where it belongs in the Roblox tree.
// `file` is the $path, expressed relative to the project ROOT so Rojo can find
// it regardless of whether it came from a place or the shared library.
function getVirtualPath(filepath, srcRoot) {
  const relativePath = path.relative(srcRoot, filepath);
  const parts = relativePath.split(path.sep);
  const filename = path.basename(filepath, ".luau");
  const folderName =
    parts.length > 1 ? toPascalCase(parts[parts.length - 2]) : "";
  const isInit = filename === "init";

  let name;
  if (isInit) {
    name = folderName;
  } else if (
    ["server", "client", "utils", "types"].includes(filename.toLowerCase())
  ) {
    name = folderName + toPascalCase(filename);
  } else {
    name = filename;
  }

  return {
    isInit,
    target: isServerFile(filename)
      ? "ServerScriptService"
      : "ReplicatedStorage",
    folder: parts.slice(0, -1).map(toPascalCase),
    name,
    file: toPosix(
      path.relative(ROOT, isInit ? path.dirname(filepath) : filepath),
    ),
  };
}

// Auto-discovers a place's startup/ files and routes them to RS (shared realm),
// SSS (server), or StarterPlayerScripts (client).
function discoverStartup(startupPath) {
  const shared = { $className: "Folder" };
  const server = { $className: "Folder" };
  const client = {};

  if (!fs.existsSync(startupPath)) return { shared, server, client };

  for (const entry of fs.readdirSync(startupPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".luau")) continue;
    const basename = path.basename(entry.name, ".luau");
    const key = toPascalCase(basename.replace(/\.(server|client)$/, ""));
    let dest;
    if (isServerFile(basename)) dest = server;
    else if (isClientFile(basename)) dest = client;
    else dest = shared;
    dest[key] = {
      $path: toPosix(path.relative(ROOT, path.join(startupPath, entry.name))),
    };
  }

  return { shared, server, client };
}

// Walk a src dir for .luau files, skipping any startup/ dir (handled separately).
function walk(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.toLowerCase() === "startup") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, callback);
    } else if (entry.isFile() && entry.name.endsWith(".luau")) {
      callback(full);
    }
  }
}

function discoverPlaces() {
  if (!fs.existsSync(PLACES_PATH)) return [];
  return fs
    .readdirSync(PLACES_PATH, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

function generatePlace(place) {
  const placeSrc = path.join(PLACES_PATH, place, "src");
  const startupPath = path.join(placeSrc, "startup");
  const initClaimedFolders = new Set();

  const {
    shared: startupShared,
    server: startupServer,
    client: startupClient,
  } = discoverStartup(startupPath);

  const tree = {
    emitLegacyScripts: false,
    name: place,
    tree: {
      $className: "DataModel",
      ReplicatedStorage: {
        Source: {
          $className: "Folder",
          Features: { $className: "Folder" },
          Core: { $className: "Folder" },
          Game: { $className: "Folder" },
          StartUp: startupShared,
        },
        Packages: { $path: "Packages" },
      },
      ServerScriptService: {
        Features: { $className: "Folder" },
        Core: { $className: "Folder" },
        Game: { $className: "Folder" },
        StartUp: startupServer,
      },
      StarterPlayer: {
        StarterPlayerScripts: {
          $className: "StarterPlayerScripts",
          ...startupClient,
        },
      },
    },
  };

  const sharedRoot = tree.tree.ReplicatedStorage.Source;
  const serverRoot = tree.tree.ServerScriptService;

  const apply = (filepath, srcRoot) => {
    const { target, folder, name, file, isInit } = getVirtualPath(
      filepath,
      srcRoot,
    );
    const root = target === "ServerScriptService" ? serverRoot : sharedRoot;
    const fullFolderKey = folder.join("/");

    if (isInit) {
      const parent = folder.slice(0, -1).reduce((acc, part) => {
        if (!acc[part]) acc[part] = { $className: "Folder" };
        return acc[part];
      }, root);
      parent[name] = { $path: file };
      initClaimedFolders.add(fullFolderKey);
      return;
    }

    if (initClaimedFolders.has(fullFolderKey)) return;

    let current = root;
    for (const part of folder) {
      if (!current[part]) current[part] = { $className: "Folder" };
      current = current[part];
    }
    current[name] = { $path: file };
  };

  // Shared first, then the place — so place modules win any name collision.
  walk(SHARED_SRC, (fp) => apply(fp, SHARED_SRC));
  walk(placeSrc, (fp) => apply(fp, placeSrc));

  const outputPath = path.join(ROOT, `${place}.project.json`);
  fs.writeFileSync(outputPath, JSON.stringify(tree, null, 2));
  return outputPath;
}

function generate() {
  const places = discoverPlaces();
  if (places.length === 0) {
    console.warn("[genFeatureTree] No places found under places/.");
    return;
  }
  const ts = new Date().toLocaleTimeString();
  for (const place of places) {
    const out = generatePlace(place);
    console.log(`[${ts}] ${path.basename(out)} generated`);
  }
}

generate();

if (WATCH_MODE) {
  const chokidar = require("chokidar");
  let debounceTimer = null;

  function onEvent(event, filepath) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(
        `[watch] ${event}: ${toPosix(path.relative(process.cwd(), filepath))}`,
      );
      generate();
    }, 150);
  }

  chokidar
    .watch([PLACES_PATH, SHARED_SRC], { ignoreInitial: true, persistent: true })
    .on("add", (fp) => onEvent("add", fp))
    .on("unlink", (fp) => onEvent("remove", fp))
    .on("addDir", (fp) => onEvent("mkdir", fp))
    .on("unlinkDir", (fp) => onEvent("rmdir", fp));

  console.log("[watch] Watching places/ and shared/ for changes...");
}
