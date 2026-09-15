"""Stamp pages/assets before uploading: python release.py 2026-09-15-02"""
import json
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parent

def stamp(version):
    if not re.fullmatch(r'[A-Za-z0-9._-]{1,80}', version):
        raise SystemExit('Use a unique version containing letters, numbers, dots, underscores or hyphens.')
    for path in ROOT.rglob('*.html'):
        text = path.read_text(encoding='utf-8')
        text = re.sub(r'(<meta name="site-version" content=")[^"]*(">)',
                      lambda m: m[1] + version + m[2], text)
        def asset(match):
            url = urlsplit(match[2])
            if url.scheme or url.netloc or not url.path.endswith(('.js', '.css')):
                return match[0]
            query = dict(parse_qsl(url.query))
            query['v'] = version
            return match[1] + urlunsplit(url._replace(query=urlencode(query))) + match[3]
        text = re.sub(r'((?:src|href)=")([^"]+)(")', asset, text)
        path.write_text(text, encoding='utf-8')
    (ROOT / 'version.json').write_text(json.dumps({'version': version}, indent=2) + '\n', encoding='utf-8')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python release.py UNIQUE-VERSION')
    stamp(sys.argv[1])
