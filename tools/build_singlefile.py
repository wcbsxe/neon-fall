#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 index.html + game.js 合成一个完全自包含的单文件 HTML。
双击即可玩，不经任何 exe，不会触发 SmartScreen / UAC。
"""
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)


def read(p):
    with io.open(p, 'r', encoding='utf-8') as f:
        return f.read()


def main():
    html = read(os.path.join(SRC, 'index.html'))
    js = read(os.path.join(SRC, 'game.js'))

    # 安全性检查：JS 里不能出现会提前闭合 <script> 的序列
    for bad in ('</script', '<!--'):
        if bad in js:
            sys.exit('ERROR: game.js contains %r which breaks inlining' % bad)

    marker = '<script src="game.js"></script>'
    if marker not in html:
        sys.exit('ERROR: marker not found in index.html')

    # 用内联代码替换外链
    inline = '<script>\n' + js + '\n</script>'
    out = html.replace(marker, inline)

    dst_dir = os.path.join(SRC, 'dist')
    if not os.path.isdir(dst_dir):
        os.makedirs(dst_dir)
    dst = os.path.join(dst_dir, '霓虹坠落.html')
    with io.open(dst, 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)

    size = os.path.getsize(dst)
    print('BUILT %s' % dst)
    print('SIZE  %d bytes (%.1f KB)' % (size, size / 1024.0))
    print('HTML  %d bytes' % len(html))
    print('JS    %d bytes' % len(js))


if __name__ == '__main__':
    main()
