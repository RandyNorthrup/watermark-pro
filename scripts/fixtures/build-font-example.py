"""Create the landing font specimen from six real bundled, open-licensed fonts."""
import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('brand_art', ROOT / 'scripts/build-brand.py')
brand = importlib.util.module_from_spec(spec)
spec.loader.exec_module(brand)

FONTS = [
    ('Inter', '@fontsource-variable/inter', 'inter-latin-wght-normal.woff2'),
    ('Playfair Display', '@fontsource-variable/playfair-display', 'playfair-display-latin-wght-normal.woff2'),
    ('Bangers', '@fontsource/bangers', 'bangers-latin-400-normal.woff2'),
    ('Great Vibes', '@fontsource/great-vibes', 'great-vibes-latin-400-normal.woff2'),
    ('Caveat', '@fontsource-variable/caveat', 'caveat-latin-wght-normal.woff2'),
    ('Fira Code', '@fontsource-variable/fira-code', 'fira-code-latin-wght-normal.woff2'),
]
label_font = brand.instantiateVariableFont(brand.TTFont(brand.FONT_ROOT / 'files/inter-latin-wght-normal.woff2'), {'wght': 400}, inplace=True)
body = '<rect width="960" height="720" fill="#fbf9f7"/>'
for index, (name, package, file) in enumerate(FONTS):
    font = brand.TTFont(ROOT / 'node_modules' / package / 'files' / file)
    if 'fvar' in font:
        font = brand.instantiateVariableFont(font, {'wght': 500}, inplace=True)
    baseline = 101 + index * 105
    text, _ = brand.word_paths(font, '#292329', size=65, left=68, baseline=baseline)
    label, _ = brand.word_paths(label_font, '#746973', size=19, left=638, baseline=baseline - 14, text=name)
    body += text + label
    if index < len(FONTS) - 1:
        body += f'<path d="M64 {baseline + 27}H896" stroke="#e5dcdf"/>'
(ROOT / 'public/product/fonts.svg').write_text(brand.svg(body, 960, 720, 'Six of Lumafoil\'s bundled font families'), encoding='utf8')
print('Generated authentic six-family font specimen.')
