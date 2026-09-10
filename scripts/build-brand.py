"""Build portable outlined Lumafoil logos from the canonical Inter font.

Tooling: fonttools 4.64.0, installed only under temp/brand-tools. Font software
is unchanged; the SVG paths are typeset artwork, permitted by the font's OFL.
"""
import base64
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'temp/brand-tools'))
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

OUTPUT = ROOT / 'public/brand'
FONT_ROOT = ROOT / 'node_modules/@fontsource-variable/inter'
INK = '#292329'
ROSE = '#c86b82'
DEEP_ROSE = '#a94965'
MARK_PATH = 'M7 5v14h11M12 5h6M12 10h4'

def svg(body, width, height, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{title}">{body}</svg>\n'

def mark(ink='#ffffff', background=ROSE):
    tile = '' if background is None else f'<rect width="64" height="64" rx="21.333" fill="{background}"/>'
    return tile + f'<g transform="translate(14.222 14.222) scale(1.48148)"><path d="{MARK_PATH}" fill="none" stroke="{ink}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>'

def word_paths(font, colour, size=66, left=0, baseline=75, text='Lumafoil'):
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = size / font['head'].unitsPerEm
    cursor = 0
    paths = []
    for character in text:
        name = cmap[ord(character)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        paths.append(f'<path transform="translate({left + cursor * scale:.3f} {baseline}) scale({scale:.8f} {-scale:.8f})" d="{pen.getCommands()}"/>')
        cursor += font['hmtx'][name][0] - 25
    return f'<g fill="{colour}">' + ''.join(paths) + '</g>', round(cursor * scale)

def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    font = instantiateVariableFont(TTFont(FONT_ROOT / 'files/inter-latin-wght-normal.woff2'), {'wght': 650}, inplace=True)
    for name, colour in [('dark', INK), ('light', '#ffffff'), ('rose', DEEP_ROSE)]:
        word, width = word_paths(font, colour, left=0)
        (OUTPUT / f'wordmark-{name}.svg').write_text(svg(word, width + 8, 100, 'Lumafoil'), encoding='utf-8')
        word, width = word_paths(font, colour, left=112)
        icon = f'<g transform="translate(0 2) scale(1.5)">{mark()}</g>'
        (OUTPUT / f'logo-{name}.svg').write_text(svg(icon + word, width + 120, 100, 'Lumafoil'), encoding='utf-8')
    for name, foreground, background in [('rose','#ffffff',ROSE),('dark','#ffffff',INK),('light',INK,'#ffffff'),('mono-dark',INK,None),('mono-light','#ffffff',None)]:
        (OUTPUT / f'mark-{name}.svg').write_text(svg(mark(foreground,background),64,64,'Lumafoil'),encoding='utf-8')
    (ROOT / 'public/favicon.svg').write_text(svg(mark(),64,64,'Lumafoil'),encoding='utf-8')
    (OUTPUT / 'INTER-LICENSE.txt').write_bytes((FONT_ROOT / 'LICENSE').read_bytes())
    (OUTPUT / 'inter-variable.woff2').write_bytes((FONT_ROOT / 'files/inter-latin-wght-normal.woff2').read_bytes())
    for name, colour in [('dark', INK), ('light', '#ffffff')]:
        word, width = word_paths(font, colour, left=112)
        icon = f'<g transform="translate(0 2) scale(1.5)">{mark(colour, None)}</g>'
        (OUTPUT / f'logo-mono-{name}.svg').write_text(svg(icon + word, width + 120, 100, 'Lumafoil'), encoding='utf-8')
    maskable = f'<rect width="64" height="64" fill="{ROSE}"/><g transform="translate(6.4 6.4) scale(.8)">{mark(background=None)}</g>'
    (OUTPUT / 'mark-maskable.svg').write_text(svg(maskable,64,64,'Lumafoil'),encoding='utf-8')
    screenshot = base64.b64encode((ROOT / 'public/product/editor-light.webp').read_bytes()).decode()
    for name, width, height in [('social-wide',1200,630), ('social-square',1080,1080)]:
        square = width == height
        body = '<rect width="100%" height="100%" fill="#fbf9f7"/>'
        body += f'<g transform="translate(56 42)">{mark()}</g>'
        word, _ = word_paths(font, INK, size=46, left=140, baseline=92)
        body += word
        for index, line in enumerate(['Watermark photos,', 'videos, and PDFs.']):
            text, _ = word_paths(font, INK, size=54 if square else 48, left=56, baseline=205 + index * 66, text=line)
            body += text
        subtitle, _ = word_paths(font, DEEP_ROSE, size=22, left=56, baseline=335, text='lumafoil.com')
        body += subtitle
        image_x, image_y, image_width = (48,420,984) if square else (590,138,790)
        image_height = round(image_width * 980 / 1440)
        body += f'<defs><clipPath id="preview"><rect x="{image_x}" y="{image_y}" width="{image_width}" height="{image_height}" rx="14"/></clipPath></defs>'
        body += f'<image href="data:image/webp;base64,{screenshot}" x="{image_x}" y="{image_y}" width="{image_width}" height="{image_height}" clip-path="url(#preview)"/>'
        (OUTPUT / f'{name}.svg').write_text(svg(body,width,height,'Lumafoil: watermark photos, videos, and PDFs'),encoding='utf-8')
    tokens = {'brand':'Lumafoil','domain':'https://lumafoil.com','access':'invite-only','colours':{'rose':ROSE,'action':DEEP_ROSE,'ink':INK,'paper':'#fbf9f7','white':'#ffffff','muted':'#746973','dark':'#191619'},'type':{'family':'Inter Variable','wordmarkWeight':650,'bodyWeight':400,'controlWeight':600},'geometry':{'markViewBox':'0 0 64 64','path':MARK_PATH},'fontSource':{'package':'@fontsource-variable/inter','license':'OFL-1.1','version':json.loads((FONT_ROOT/'package.json').read_text(encoding='utf-8'))['version']}}
    (OUTPUT / 'tokens.json').write_text(json.dumps(tokens,indent=2)+'\n',encoding='utf-8')
    print('Generated outlined logos, wordmarks, symbol variants, favicon and brand tokens.')

if __name__ == '__main__':
    main()
