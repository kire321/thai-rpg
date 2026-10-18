#!/usr/bin/env python3
"""Same-origin test server for SW cache tests.

Serves the built app (dist/) at / AND a local CMS mirror at /cms/ on the SAME
origin, so the service worker intercepts every request (app shell + content +
images). Unlike the cross-origin cms-mirror setup, an <img> request here is
intercepted by the SW, which is the only faithful way to test offline image
serving — Playwright routing cannot intercept SW subresource fetches either.

Failure injection (fails fetches for BOTH page and SW):
  /__control__?block=narrator.png,grammar_mill.png   block by path substring
  /__control__?unblock=1                             clear blocks
  /__control__?offline=1 / ?offline=0               block everything (except /__control__)

Usage:
  python3 src/test/test-origin-server.py 8088 dist/ /path/to/cms-mirror
"""
import http.server
import mimetypes
import os
import socketserver
import sys
import urllib.parse

PORT = int(sys.argv[1])
DIST = os.path.abspath(sys.argv[2])
MIRROR = os.path.abspath(sys.argv[3])
BLOCKED = set()
OFFLINE = False


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        global OFFLINE
        u = urllib.parse.urlparse(self.path)
        if u.path == '/__control__':
            q = urllib.parse.parse_qs(u.query)
            if 'block' in q:
                for b in q['block'][0].split(','):
                    if b:
                        BLOCKED.add(b)
            if 'unblock' in q:
                BLOCKED.clear()
            if 'offline' in q:
                OFFLINE = q['offline'][0] == '1'
            body = f'blocked={sorted(BLOCKED)} offline={OFFLINE}'.encode()
            self.send_response(200)
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if OFFLINE or any(b in u.path for b in BLOCKED):
            self.send_response(503)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if u.path.startswith('/cms/'):
            return self.serve_file(os.path.join(MIRROR, u.path[len('/cms/'):]))
        rel = u.path.lstrip('/') or 'index.html'
        return self.serve_file(os.path.join(DIST, rel))

    def serve_file(self, fp):
        if not os.path.isfile(fp):
            self.send_response(404)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        with open(fp, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(fp)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)


socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer.daemon_threads = True
with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Handler) as httpd:
    print(f'test-origin-server on :{PORT} dist={DIST} mirror={MIRROR}', flush=True)
    httpd.serve_forever()
