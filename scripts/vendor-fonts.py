"""Vendor 500 additional unique Fontsource families, pinned by version and integrity.

Only font bytes, metadata and license text are read from registry archives. No
package code runs. Existing package-backed fonts remain the canonical baseline.
"""
import base64
import concurrent.futures
import hashlib
import http.client
import io
import json
import re
import ssl
import tarfile
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public/fonts"
CATALOGUE = ROOT / "src/client/fonts/extended-catalogue.json"
PROVENANCE = OUTPUT / "manifest.json"
CATEGORY_COUNTS = {"sans-serif": 130, "serif": 120, "display": 120, "handwriting": 100, "monospace": 30}
CATEGORIES = {"sans-serif": "sans", "serif": "serif", "display": "display", "handwriting": "script", "monospace": "mono"}
FONT_BUDGET = 120 * 1024
WORKERS = 8
CACHE = ROOT / 'temp/font-vendor-cache'
DOWNLOAD_HOSTS = {"api.fontsource.org", "registry.npmjs.org"}
DOWNLOAD_TIMEOUT_SECONDS = 60

class FontBudgetError(ValueError):
    """A valid candidate does not meet the existing font-file budget."""

def read_url(url):
    """Read approved HTTPS origins without a general URL handler or redirect following."""
    if not isinstance(url, str) or any(ord(character) <= 32 or ord(character) == 127 for character in url):
        raise ValueError("Invalid font download URL")
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in DOWNLOAD_HOSTS or parsed.username is not None or parsed.password is not None or parsed.port not in {None, 443} or parsed.fragment:
        raise ValueError("Font download must use an approved HTTPS origin")
    # Audited TLS context enforces certificate/hostname checks; the rule flags every API use. PLAN.md §9.
    # nosemgrep: python.lang.security.audit.httpsconnection-detected.httpsconnection-detected
    connection = http.client.HTTPSConnection(parsed.hostname, timeout=DOWNLOAD_TIMEOUT_SECONDS, context=ssl.create_default_context())
    try:
        target = urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
        connection.request("GET", target, headers={"User-Agent": "Lumafoil-font-vendor/1"})
        response = connection.getresponse()
        if response.status != 200:
            raise ValueError(f"Font download refused HTTP {response.status}; redirects are not followed")
        return response.read()
    finally:
        connection.close()

def read_json(url):
    return json.loads(read_url(url))

def vendor(font):
    font_id = font["id"]
    if re.fullmatch(r"[a-z0-9-]+", font_id) is None:
        raise ValueError("Unexpected font identifier")
    cache_path = CACHE / f'{font_id}.json'
    if cache_path.exists():
        cached = json.loads(cache_path.read_text(encoding='utf-8'))
        if all((ROOT / 'public' / file['url'].lstrip('/')).exists() and hashlib.sha256((ROOT / 'public' / file['url'].lstrip('/')).read_bytes()).hexdigest() == file['sha256'] for file in cached[1]['files']):
            return tuple(cached)
    detail = read_json(f"https://api.fontsource.org/v1/fonts/{font_id}")
    version = detail["npmVersion"]
    package = read_json(f"https://registry.npmjs.org/@fontsource%2F{font_id}/{version}")
    if package.get("peerDependencies"):
        raise ValueError(f"{font_id} needs explicit peer review")
    if package["license"] not in {"OFL-1.1", "Apache-2.0"}:
        raise ValueError(f"{font_id} license is not approved")
    dist = package["dist"]
    archive = read_url(dist["tarball"])
    expected = "sha512-" + base64.b64encode(hashlib.sha512(archive).digest()).decode()
    if expected != dist["integrity"]:
        raise ValueError(f"{font_id} registry integrity mismatch")
    files = []
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        license_file = tar.extractfile("package/LICENSE")
        if license_file is None:
            raise ValueError(f"{font_id} missing license")
        license_bytes = license_file.read()
        (OUTPUT / "licenses" / f"{font_id}.txt").write_bytes(license_bytes)
        for weight in (400, 700):
            if weight not in font["weights"]:
                continue
            member = tar.extractfile(f"package/files/{font_id}-latin-{weight}-normal.woff2")
            if member is None:
                raise ValueError(f"{font_id} missing weight {weight}")
            data = member.read()
            if not data.startswith(b"wOF2"):
                raise ValueError(f"{font_id} invalid WOFF2")
            if len(data) > FONT_BUDGET:
                raise FontBudgetError(f"{font_id} file exceeds 120 KiB")
            digest = hashlib.sha256(data).hexdigest()
            filename = f"{font_id}-{weight}-{digest[:16]}.woff2"
            (OUTPUT / filename).write_bytes(data)
            files.append({"weight": weight, "url": f"/fonts/{filename}", "sha256": digest, "bytes": len(data)})
    record = {"id": font_id, "packageName": package["name"], "family": font["family"], "category": CATEGORIES[font["category"]], "isVariable": False, "weights": [file["weight"] for file in files], "license": package["license"], "files": [{"weight": file["weight"], "url": file["url"]} for file in files], "licensePath": f"/fonts/licenses/{font_id}.txt"}
    provenance = {"id": font_id, "package": package["name"], "version": version, "tarball": dist["tarball"], "integrity": dist["integrity"], "license": package["license"], "licenseSha256": hashlib.sha256(license_bytes).hexdigest(), "peerDependencies": package.get("peerDependencies", {}), "files": files}
    cache_path.write_text(json.dumps([record, provenance], ensure_ascii=False), encoding='utf-8')
    return record, provenance

def main():
    existing = set(re.findall(r"id: '([^']+)'", (ROOT / "src/client/fonts/catalogue.ts").read_text(encoding="utf-8")))
    fonts = read_json("https://api.fontsource.org/v1/fonts")
    selected = []
    reserves = {}
    for category, count in CATEGORY_COUNTS.items():
        choices = sorted([font for font in fonts if font["id"] not in existing and font["type"] == 'google' and font["category"] == category and font.get("license") in {"OFL-1.1", "Apache-2.0"} and "latin" in font["subsets"] and 400 in font["weights"] and "normal" in font["styles"]], key=lambda font: font["id"])
        if len(choices) < count:
            raise ValueError(f"Not enough distinct {category} families: {len(choices)}")
        picked = [choices[index * len(choices) // count] for index in range(count)]
        selected.extend(picked)
        picked_ids = {font['id'] for font in picked}
        reserves[category] = [font for font in choices if font['id'] not in picked_ids]
    (OUTPUT / "licenses").mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(vendor, font): font for font in selected}
        for future in concurrent.futures.as_completed(futures):
            try:
                results.append(future.result())
            except FontBudgetError as error:
                print(f'Excluded candidate: {error}', flush=True)
                category = futures[future]['category']
                while True:
                    replacement = reserves[category].pop(0)
                    try:
                        results.append(vendor(replacement))
                        break
                    except FontBudgetError as replacement_error:
                        print(f'Excluded candidate: {replacement_error}', flush=True)
            if len(results) % 50 == 0:
                print(f"Vendored {len(results)}/500 font families", flush=True)
    records = sorted([result[0] for result in results], key=lambda font: font["family"])
    provenance = sorted([result[1] for result in results], key=lambda font: font["id"])
    CATALOGUE.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    PROVENANCE.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    expected = {OUTPUT / file['url'].removeprefix('/fonts/') for font in provenance for file in font['files']}
    expected.update(OUTPUT / 'licenses' / f"{font['id']}.txt" for font in provenance)
    for directory, pattern in [(OUTPUT, '*.woff2'), (OUTPUT / 'licenses', '*.txt')]:
        if not directory.resolve().is_relative_to((ROOT / 'public').resolve()):
            raise ValueError('Font cleanup escaped the asset directory')
        for asset in directory.glob(pattern):
            if asset not in expected:
                asset.unlink()
    total = sum(file["bytes"] for font in provenance for file in font["files"])
    print(f"500 additional families; {total:,} font bytes; every package version and SHA-512 recorded.", flush=True)

if __name__ == "__main__":
    main()
