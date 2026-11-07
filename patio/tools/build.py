"""index.html = full HTML document wrapped around patio-concept.html (the artifact fragment)."""
import os, sys
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
frag = open(os.path.join(root, 'patio-concept.html'), encoding='utf-8').read()
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="description" content="Patio and side yard concept: before/after renders from site photos, with an ideas board.">\n'
        '<meta name="color-scheme" content="light dark">\n')
frag = frag.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
frag = frag.replace('</style>\n', '</style>\n</head>\n<body>\n', 1)
out = head + frag.rstrip('\n') + '\n</body>\n</html>\n'
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(out)
print('index.html', len(out), 'bytes')
