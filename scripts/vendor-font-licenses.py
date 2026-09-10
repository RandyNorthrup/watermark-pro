"""Publish license notices for the pinned, package-backed font catalogue."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
output = ROOT / "public" / "fonts" / "licenses"
output.mkdir(parents=True, exist_ok=True)
manifest = []
for name, version in package["dependencies"].items():
    if not name.startswith("@fontsource"):
        continue
    source = ROOT / "node_modules" / name
    installed = json.loads((source / "package.json").read_text(encoding="utf-8"))
    if installed["version"] != version:
        raise ValueError("Installed font does not match exact package pin: " + name)
    notice = source / "LICENSE"
    if not notice.exists():
        notice = source / "LICENSE.txt"
    data = notice.read_bytes()
    destination = output / (name.split("/")[-1] + ".txt")
    destination.write_bytes(data)
    manifest.append({"package": name, "version": version, "integrity": lock["packages"]["node_modules/" + name]["integrity"], "license": "/fonts/licenses/" + destination.name, "sha256": hashlib.sha256(data).hexdigest()})
(output / "packages.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Published {len(manifest)} package font notices with pinned provenance.")
