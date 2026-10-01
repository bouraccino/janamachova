#!/usr/bin/env python3
"""Vygeneruje QR Platbu (formát SPAYD) jako inline SVG a vloží ji do index.html.

Použití:
    pip install segno
    python3 tools/make-qr.py CZ6508000000192000145399            # IBAN
    python3 tools/make-qr.py 19-2000145399/0800                  # nebo číslo účtu/kód banky (předčíslí-číslo/kód)
    python3 tools/make-qr.py CZ65... --msg "ZNALECKY POSUDEK"    # volitelná zpráva pro příjemce

Skript přepíše blok <!-- QR:start --> … <!-- QR:end --> v index.html a doplní číslo účtu/IBAN do textu.
"""
import re, sys, argparse

def to_iban(acc: str) -> str:
    acc = acc.replace(' ', '').upper()
    if acc.startswith('CZ'):
        return acc
    m = re.fullmatch(r'(?:(\d{1,6})-)?(\d{2,10})/(\d{4})', acc)
    if not m:
        sys.exit('Neznámý formát účtu. Zadejte IBAN nebo předčíslí-číslo/kód banky.')
    prefix, number, bank = (m.group(1) or '0').zfill(6), m.group(2).zfill(10), m.group(3)
    bban = bank + prefix + number
    check = 98 - int(bban + '123500') % 97   # C=12, Z=35, 00
    return f'CZ{check:02d}{bban}'

def group4(s: str) -> str:
    return ' '.join(s[i:i + 4] for i in range(0, len(s), 4))

ap = argparse.ArgumentParser()
ap.add_argument('account')
ap.add_argument('--msg', default='ZNALECKY POSUDEK')
ap.add_argument('--file', default='index.html')
a = ap.parse_args()

import segno
iban = to_iban(a.account)
payload = f'SPD*1.0*ACC:{iban}*CC:CZK*MSG:{a.msg[:60].upper()}'
svg = segno.make(payload, error='m').svg_inline(scale=1, dark='#121214', light=None, omitsize=True, svgclass=None, lineclass=None)
svg = svg.replace('<svg ', '<svg role="img" aria-label="QR Platba: ' + iban + '" ', 1)

html = open(a.file, encoding='utf-8').read()
html, n = re.subn(r'<!-- QR:start -->.*?<!-- QR:end -->', '<!-- QR:start -->' + svg + '<!-- QR:end -->', html, flags=re.S)
if n != 1:
    sys.exit('Blok <!-- QR:start --> … <!-- QR:end --> nenalezen.')
html = re.sub(r'(<dd class="pay__iban">).*?(</dd>)', r'\g<1>' + group4(iban) + r'\g<2>', html, flags=re.S)
html = re.sub(r'(<dd class="pay__acc">).*?(</dd>)', r'\g<1>' + a.account + r'\g<2>', html, flags=re.S)
html = html.replace('<span class="pay__sample">VZOR – doplnit číslo účtu</span>', '')
open(a.file, 'w', encoding='utf-8').write(html)
print('OK:', payload)
