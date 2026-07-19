#!/usr/bin/env python3
"""CMS mirror with failure injection for testing.
Control: GET /__control__?block=a.png,b.png  — those paths get connection-closed
         GET /__control__?unblock=1         — clear blocklist
         GET /__control__?offline=1|0       — ALL requests get connection-closed

Populate a mirror directory from the live CMS (JSONs + images), then:
  python3 src/test/cms-mirror.py 9001 /path/to/cms-copy
"""
import http.server, functools, urllib.parse, sys

BLOCKED = set()
OFFLINE = False

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

    def do_GET(self):
        global BLOCKED, OFFLINE
        if self.path.startswith('/__control__'):
            q = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(q)
            if 'block' in params:
                BLOCKED = set(params['block'][0].split(','))
            if 'unblock' in params:
                BLOCKED = set()
            if 'offline' in params:
                OFFLINE = params['offline'][0] == '1'
            body = f'blocked={sorted(BLOCKED)} offline={OFFLINE}'.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        # Simulate network unreachable: close connection without response
        if OFFLINE or any(self.path.split('?')[0].endswith('/' + b) for b in BLOCKED):
            self.close_connection = True
            return  # drops the connection: fetch() rejects with network error
        super().do_GET()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'public, max-age=14400')
        self.send_header('Vary', 'Origin')
        super().end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9001
    directory = sys.argv[2] if len(sys.argv) > 2 else '/tmp/cms-mirror'
    http.server.ThreadingHTTPServer(
        ('127.0.0.1', port), functools.partial(Handler, directory=directory)
    ).serve_forever()
