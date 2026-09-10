"""Vendor reviewed Fluent color art from a pinned, content-verified Git tree."""
import concurrent.futures
import hashlib
import http.client
import json
import os
import re
import ssl
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMIT = "1ffb34c752ecf5d402f04cfb4b392c77f57c54bc"
CACHE = ROOT / "temp" / "sticker-vendor-cache"
OUTPUT = ROOT / "public" / "stickers"
COUNT_PER_GROUP = 50
GROUPS = ["Smileys & Emotion", "People & Body", "Animals & Nature", "Food & Drink", "Travel & Places", "Activities", "Objects", "Symbols"]
DOWNLOAD_HOSTS = {"raw.githubusercontent.com", "api.github.com"}
DOWNLOAD_TIMEOUT_SECONDS = 60


def read_url(url):
    """Use verified HTTPS to explicit GitHub hosts; fail closed on every redirect."""
    if not isinstance(url, str) or any(ord(character) <= 32 or ord(character) == 127 for character in url):
        raise ValueError("Invalid sticker download URL")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in DOWNLOAD_HOSTS or parsed.username is not None or parsed.password is not None or parsed.port not in {None, 443} or parsed.fragment:
        raise ValueError("Sticker download must use an approved HTTPS origin")
    # Audited TLS context enforces certificate/hostname checks; the rule flags every API use. PLAN.md §9.
    # nosemgrep: python.lang.security.audit.httpsconnection-detected.httpsconnection-detected
    connection = http.client.HTTPSConnection(parsed.hostname, timeout=DOWNLOAD_TIMEOUT_SECONDS, context=ssl.create_default_context())
    try:
        target = urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
        connection.request("GET", target, headers={"User-Agent": "Lumafoil-sticker-vendor/1"})
        response = connection.getresponse()
        if response.status != 200:
            raise ValueError(f"Sticker download refused HTTP {response.status}; redirects are not followed")
        return response.read()
    finally:
        connection.close()


def fetch(path, sha):
    if not isinstance(sha, str) or re.fullmatch(r"[0-9a-f]{40}", sha) is None or not isinstance(path, str) or path.startswith("/") or "\\" in path or any(part in {"", ".", ".."} for part in path.split("/")):
        raise ValueError("Invalid pinned Git blob identity")
    target = CACHE / sha
    if not target.exists():
        url = "https://raw.githubusercontent.com/microsoft/fluentui-emoji/" + COMMIT + "/" + urllib.parse.quote(path)
        try:
            target.write_bytes(read_url(url))
        except Exception as error:
            raise RuntimeError("Unable to fetch " + url) from error
    data = target.read_bytes()
    # This is Git's upstream object identity, not a new cryptographic scheme; assets also record SHA-256. PLAN.md §9.
    # nosemgrep: python.lang.security.insecure-hash-algorithms.insecure-hash-algorithm-sha1
    actual = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data, usedforsecurity=False).hexdigest()
    if actual != sha:
        raise ValueError("Git content mismatch: " + path)
    return data


def check_svg(data):
    if b"<!DOCTYPE" in data or b"<!ENTITY" in data:
        raise ValueError("SVG entity declarations refused")
    root = ET.fromstring(data)
    allowed = {"svg", "g", "path", "line", "polygon", "polyline", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "rect", "circle", "ellipse", "filter", "feGaussianBlur", "feBlend", "feComposite", "feColorMatrix", "feFlood", "feOffset"}
    for node in root.iter():
        if node.tag.split("}")[-1] not in allowed:
            raise ValueError("Unsupported SVG element: " + node.tag)
        for key, value in node.attrib.items():
            normalized = value.casefold()
            if key.lower().split("}")[-1].startswith("on") or "href" in key.lower() or "http" in normalized or "data:" in normalized or "javascript:" in normalized:
                raise ValueError("Active/external SVG reference")
            for match in re.findall(r"url\((.*?)\)", value, re.IGNORECASE):
                if not match.startswith("#"):
                    raise ValueError("External SVG URL")


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    tree_path = Path(os.environ["TEMP"]) / "lumafoil-fluent-tree.json"
    if tree_path.exists() and "Ã" not in tree_path.read_text(encoding="utf-8"):
        tree = json.loads(tree_path.read_text(encoding="utf-8"))
    else:
        tree = json.loads(read_url("https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/" + COMMIT + "?recursive=1"))
    if tree["sha"] != COMMIT or tree.get("truncated"):
        raise ValueError("Incomplete or wrong source tree")
    blobs = {item["path"]: item["sha"] for item in tree["tree"] if item["type"] == "blob"}
    candidates = {}
    for path, sha in blobs.items():
        parts = path.split("/")
        if path.endswith(".svg") and "/Color/" in path and (len(parts) == 4 or (len(parts) == 5 and parts[2] == "Default")):
            if "assets/" + parts[1] + "/metadata.json" in blobs:
                candidates[parts[1]] = (path, sha)

    def metadata(name):
        path = "assets/" + name + "/metadata.json"
        return name, json.loads(fetch(path, blobs[path]))

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        records = list(pool.map(metadata, sorted(candidates)))
    selected = []
    for group in GROUPS:
        group_records = [(name, meta) for name, meta in records if meta["group"] == group]
        # Deterministic sampling spreads choices through the catalogue; only one
        # base/default drawing per Unicode design, never skin-tone variants.
        group_records.sort(key=lambda entry: hashlib.sha256(entry[0].encode()).hexdigest())
        selected.extend(group_records[:COUNT_PER_GROUP])

    def vendor(record):
        name, meta = record
        path, sha = candidates[name]
        data = fetch(path, sha)
        check_svg(data)
        sticker_id = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        digest = hashlib.sha256(data).hexdigest()
        filename = sticker_id + "-" + digest[:12] + ".svg"
        (OUTPUT / filename).write_bytes(data)
        return {"id": sticker_id, "name": name, "category": meta["group"], "keywords": meta["keywords"], "url": "/stickers/" + filename, "sourcePath": path, "gitBlob": sha, "sha256": digest}

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        catalogue = sorted(pool.map(vendor, selected), key=lambda entry: entry["name"])
    license_bytes = fetch("LICENSE", blobs["LICENSE"])
    (OUTPUT / "LICENSE.txt").write_bytes(license_bytes)
    (ROOT / "src" / "shared" / "sticker-license.json").write_text(json.dumps(license_bytes.decode("utf-8").strip(), indent=2) + "\n", encoding="utf-8")
    icon_license = (ROOT / "node_modules" / "lucide" / "LICENSE").read_text(encoding="utf-8")
    (ROOT / "src" / "shared" / "icon-license.json").write_text(json.dumps(icon_license.strip()) + "\n", encoding="utf-8")
    (OUTPUT / "ICON-LICENSE.txt").write_text(icon_license, encoding="utf-8")
    manifest = {"source": "https://github.com/microsoft/fluentui-emoji", "commit": COMMIT, "license": "MIT", "licenseGitBlob": blobs["LICENSE"], "stickers": catalogue}
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    client = ROOT / "src" / "client" / "stickers"
    client.mkdir(parents=True, exist_ok=True)
    (client / "catalogue.json").write_text(json.dumps([{key: entry[key] for key in ["id", "name", "category", "keywords", "url"]} for entry in catalogue], indent=2) + "\n", encoding="utf-8")
    (ROOT / "src" / "shared" / "sticker-ids.json").write_text(json.dumps([entry["id"] for entry in catalogue], indent=2) + "\n", encoding="utf-8")
    print(f"Verified {len(catalogue)} distinct stickers across {len(GROUPS)} categories; {sum((OUTPUT / Path(entry['url']).name).stat().st_size for entry in catalogue):,} SVG bytes.")


if __name__ == "__main__":
    main()
